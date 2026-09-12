import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { admin, jwt, organization, phoneNumber } from "better-auth/plugins";
import { Pool } from "pg";
import { sendPasswordResetEmail } from "@/lib/resend";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	throw new Error(
		"DATABASE_URL must be configured in the server environment for Better Auth.",
	);
}

// Shared with lib/link-business.ts, which writes businessId/institutionId
// back onto auth_user directly (those fields are `input: false` below —
// deliberately not settable through Better Auth's own update-user API, so
// the trusted server-side write goes through this same pool instead).
// Vercel functions may be created concurrently and Railway's public TCP proxy
// may retire idle sockets. Keep each function instance to one short-lived
// connection instead of the `pg` default of ten.
export const pool = new Pool({
	connectionString: databaseUrl,
	max: 1,
	idleTimeoutMillis: 5_000,
	connectionTimeoutMillis: 5_000,
	allowExitOnIdle: true,
});

pool.on("error", (error) => {
	console.error("Better Auth database connection closed", {
	name: error.name,
	message: error.message,
	});
});

// apps/api's domain model (specs/00-domain-model.md) already has its own
// `user` and `account` tables in the same Postgres database. Every Better
// Auth table (core + plugins) is prefixed auth_* to avoid colliding with them.
export const auth = betterAuth({
	database: pool,

	// Better Auth's default id is a base62 string, not a UUID-apps/api's
	// Postgres columns are typed UUID (Agent.md §5: "IDs are UUIDv7") and parse
	// the JWT's `sub` claim with uuid.UUID(...), so ids must be real UUIDs.
	// NOT `generateId: "uuid"` (the string form): for an adapter whose dialect
	// natively supports UUID columns, that string tells Better Auth to expect
	// the DATABASE to default-generate the id (a DB-level DEFAULT its own
	// migration CLI doesn't actually create) rather than generating one itself
	//-confirmed by reading node_modules/@better-auth/core's get-id-field.mjs
	// after `generateId: "uuid"` produced null-id insert failures. A generator
	// function always runs in JS instead, sidestepping that.
	advanced: {
		database: {
			generateId: () => crypto.randomUUID(),
			// Schema changes are applied with `bunx auth migrate`; validating the
			// schema during every serverless cold start adds an avoidable database
			// round trip and can fail when the public TCP proxy has just retired an
			// idle connection.
			validateSchema: false,
		},
	},

	emailAndPassword: {
		enabled: true,
		// Password reset: POST /api/auth/request-password-reset issues a
		// one-hour, single-use token and hands the reset URL to Resend (or the
		// console fallback when RESEND_API_KEY is unset-see lib/resend.ts).
		// The returned URL is /reset-password/<token>?callbackURL=..., which the
		// client follows after the token is validated at
		// /api/auth/reset-password/<token>.
		sendResetPassword: ({ user, url }) =>
			sendPasswordResetEmail({
				to: user.email,
				name: user.name,
				url,
			}),
	},

	user: {
		modelName: "auth_user",
		additionalFields: {
			// Populated once the owner's business (or reviewer's institution) is
			// created in apps/api and written back here-not implemented yet,
			// see apps/web's README "Known gaps". Columns exist now so that
			// write-back is a follow-up, not another migration.
			businessId: { type: "string", required: false, input: false },
			institutionId: { type: "string", required: false, input: false },
		},
	},
	session: {
		modelName: "auth_session",
	},
	account: {
		modelName: "auth_account",
		// Automatic account linking: a Google sign-in whose verified email
		// matches an existing (e.g. email+password) user merges into that
		// account instead of erroring with a duplicate email.
		//
		// requireLocalEmailVerified: false-credential-created users have no
		// email-verification flow (no provider configured), so their local
		// emailVerified stays false; a verified Google email is the proof.
		accountLinking: {
			enabled: true,
			trustedProviders: ["google"],
			requireLocalEmailVerified: false,
			// Copy Google's profile (name + image) onto the local user when the
			// account is linked, so the avatar isn't a bare initial.
			updateUserInfoOnLink: true,
		},
	},

	socialProviders: {
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID!,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
			// Refresh name + avatar from Google's profile on every sign-in, so the
			// topbar avatar shows the Google picture instead of a bare initial.
			overrideUserInfoOnSignIn: true,
		},
	},
	verification: {
		modelName: "auth_verification",
	},

	plugins: [
		phoneNumber({
			// Dev-only stub-no SMS provider configured yet. Real delivery is
			// out of scope for this pass (ROADMAP.md Phase 0/1). OTPs are stored
			// in the core verification table (already renamed auth_verification
			// above)-the plugin has no table of its own to rename.
			sendOTP: ({ phoneNumber, code }) => {
				console.log(`[dev] MoMo/SMS OTP for ${phoneNumber}: ${code}`);
			},
		}),
		organization({
			schema: {
				organization: { modelName: "auth_organization" },
				member: { modelName: "auth_member" },
				invitation: { modelName: "auth_invitation" },
			},
		}),
		admin({
			// The plugin's own `role` field on auth_user IS our domain Role enum
			// (owner|reviewer|admin, specs/00-domain-model.md §1)-no separate
			// custom field. adminRoles gates Better Auth's admin API to our "admin".
			// Docs mention one extra session field for impersonation but don't
			// name it, so its default naming is left alone rather than guessed at.
			defaultRole: "owner",
			adminRoles: ["admin"],
		}),
		jwt({
			jwt: {
				// Must match apps/api's Claims parsing exactly (app/api/deps.py):
				// payload["sub"], payload["role"], payload["business_id"],
				// payload["institution_id"].
				definePayload: ({ user }) => ({
					sub: user.id,
					role: user.role,
					business_id: (user as { businessId?: string }).businessId ?? null,
					institution_id:
						(user as { institutionId?: string }).institutionId ?? null,
				}),
			},
		}),
		nextCookies(),
	],
});
