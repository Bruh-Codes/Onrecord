/**
 * Admin hub plugin for Better Auth.
 *
 * Copy this file into your app and add the plugin to your Better Auth config:
 *
 *   import { adminHub } from "./admin-hub";
 *   export const auth = betterAuth({
 *     // ...
 *     plugins: [/* ... *\/ adminHub({ key: process.env.ADMIN_HUB_KEY })],
 *   });
 *
 * Set ADMIN_HUB_KEY (32+ random characters, e.g. `openssl rand -base64 32`)
 * in the app's environment and paste the same key into the hub together with
 * the app's URL. Without a key the plugin stays off (its endpoints 404).
 *
 * What it exposes, only to requests carrying the key:
 *  - POST {basePath}/admin-hub/schema: the app's auth tables, fields and plugins
 *  - POST {basePath}/admin-hub/rpc: reads and writes on those auth tables only,
 *    through the app's own Better Auth database adapter
 */
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { timingSafeEqual } from "node:crypto";

const VERSION = 1;
const OPS = ["create", "findOne", "findMany", "count", "update", "updateMany", "delete", "deleteMany"] as const;
type Op = (typeof OPS)[number];

function keyMatches(given: string | null | undefined, expected: string): boolean {
	if (!given) return false;
	const a = Buffer.from(given);
	const b = Buffer.from(expected);
	return a.length === b.length && timingSafeEqual(a, b);
}

/** Turn ISO strings back into Dates for fields the schema says are dates. */
function reviveDates(value: unknown, isDate: (field: string) => boolean): unknown {
	if (!value || typeof value !== "object") return value;
	if (Array.isArray(value)) return value.map((v) => reviveDates(v, isDate));
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		out[k] = typeof v === "string" && isDate(k) && !Number.isNaN(Date.parse(v)) ? new Date(v) : v;
	}
	return out;
}

export function adminHub(options: {
	key?: string | null;
	/** Every user role your app uses, default first, e.g. ["owner", "reviewer", "admin"]. The hub only lets admins pick these. */
	roles?: string[];
}): BetterAuthPlugin {
	const key = options.key?.trim() ?? "";
	const enabled = key.length >= 32;
	if (key && !enabled) {
		throw new Error("adminHub: ADMIN_HUB_KEY must be at least 32 characters.");
	}

	const guard = (headers: Headers | undefined) => {
		if (!enabled) throw new APIError("NOT_FOUND");
		if (!keyMatches(headers?.get("x-admin-hub-key"), key)) throw new APIError("UNAUTHORIZED", { message: "Invalid admin hub key" });
	};

	return {
		id: "admin-hub",
		rateLimit: [{ pathMatcher: (p) => p.startsWith("/admin-hub/"), window: 10, max: 2000 }],
		endpoints: {
			adminHubSchema: createAuthEndpoint("/admin-hub/schema", { method: "POST", requireHeaders: true }, async (ctx) => {
				guard(ctx.headers);
				const opts = ctx.context.options;
				const models = Object.fromEntries(
					Object.entries(ctx.context.tables).map(([name, table]) => [
						name,
						{
							modelName: table.modelName,
							fields: Object.fromEntries(
								Object.entries(table.fields).map(([f, attr]) => [
									f,
									{ type: attr.type, required: !!attr.required, input: attr.input !== false, fieldName: attr.fieldName ?? f },
								]),
							),
						},
					]),
				);
				const adminPlugin = opts.plugins?.find((p) => p.id === "admin") as { options?: { defaultRole?: string; adminRoles?: string | string[] } } | undefined;
				const adminRoles = adminPlugin?.options?.adminRoles;
				return ctx.json({
					version: VERSION,
					appName: opts.appName ?? null,
					baseURL: ctx.context.baseURL,
					plugins: (opts.plugins ?? []).map((p) => p.id),
					userFields: Object.keys(opts.user?.additionalFields ?? {}),
					roles: {
						default: adminPlugin?.options?.defaultRole ?? (adminPlugin ? "user" : null),
						admin: Array.isArray(adminRoles) ? adminRoles : adminRoles ? [adminRoles] : adminPlugin ? ["admin"] : [],
						all: options.roles ?? null,
					},
					models,
				});
			}),
			adminHubRpc: createAuthEndpoint("/admin-hub/rpc", { method: "POST", requireHeaders: true }, async (ctx) => {
				guard(ctx.headers);
				const body = (ctx.body ?? {}) as { op?: Op; args?: Record<string, unknown> };
				const op = body.op;
				const args = { ...(body.args ?? {}) };
				if (!op || !OPS.includes(op)) throw new APIError("BAD_REQUEST", { message: "Unknown operation" });
				const table = ctx.context.tables[String(args.model)];
				if (!table) throw new APIError("BAD_REQUEST", { message: "Unknown model" });
				const isDate = (f: string) => table.fields[f]?.type === "date" || f === "createdAt" || f === "updatedAt" || f === "expiresAt";
				delete args.join;
				if (args.data) args.data = reviveDates(args.data, isDate);
				if (args.update) args.update = reviveDates(args.update, isDate);
				if (Array.isArray(args.where)) {
					args.where = (args.where as { field: string; value: unknown }[]).map((w) => ({ ...w, value: typeof w.value === "string" && isDate(w.field) && !Number.isNaN(Date.parse(w.value)) ? new Date(w.value) : w.value }));
				}
				const adapter = ctx.context.adapter as unknown as Record<Op, (a: unknown) => Promise<unknown>>;
				const result = await adapter[op](args);
				return ctx.json({ result: result ?? null });
			}),
		},
	} satisfies BetterAuthPlugin;
}
