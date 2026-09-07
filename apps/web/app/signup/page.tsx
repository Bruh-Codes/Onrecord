"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRightIcon, GoogleLogo } from "@/components/icons";
import { authClient } from "@/lib/auth-client";

export default function SignupPage() {
	const router = useRouter();
	const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const ready = email.trim() && password.trim();

	async function handleSubmit() {
		if (!ready || submitting) return;
		setSubmitting(true);
		setError(null);

		// Better Auth's core schema requires a `name` — we don't collect an
		// owner name at this step, so the email local-part fills it for now.
		// The business itself is created on /setup (legal name, entity type).
		const name = email.trim().split("@")[0] || "User";
		const { error: authError } =
			authMode === "signup"
				? await authClient.signUp.email({ email, password, name })
				: await authClient.signIn.email({ email, password });

		if (authError) {
			setError(authError.message ?? "Something went wrong. Please try again.");
			setSubmitting(false);
			return;
		}

		// New sign-ups have no business yet — /setup creates one and writes
		// business_id back onto this user (see lib/link-business.ts). Login
		// goes straight home; the (app) layout redirects back here if a
		// returning user somehow still has no business_id.
		router.push(authMode === "signup" ? "/setup" : "/dashboard");
	}

	return (
		<div className="min-h-dvh flex flex-col animate-fade-in">
			<div className="flex items-center px-6 sm:px-10 py-5.5">
				<span className="font-[family-name:var(--font-display)] text-[19px]">
					Onrecord
				</span>
				<button
					type="button"
					onClick={() => setAuthMode("login")}
					className="ml-auto flex items-center gap-1.5 text-[13.5px] text-ink cursor-pointer bg-transparent border-none"
				>
					Log in
					<ChevronRightIcon />
				</button>
			</div>

			<div className="flex-1 flex items-center justify-center p-6 sm:p-10">
				<div className="w-full max-w-[460px] bg-surface rounded-3xl shadow-[var(--shadow-card)] p-6 sm:p-9">
					<div className="flex gap-1 bg-panel rounded-full p-1 mb-6.5">
						<button
							type="button"
							onClick={() => setAuthMode("signup")}
							className={`flex-1 text-center py-2.5 rounded-full text-[13.5px] cursor-pointer ${
								authMode === "signup"
									? "bg-ink text-paper font-semibold"
									: "text-ink"
							}`}
						>
							Sign up
						</button>
						<button
							type="button"
							onClick={() => setAuthMode("login")}
							className={`flex-1 text-center py-2.5 rounded-full text-[13.5px] cursor-pointer ${
								authMode === "login"
									? "bg-ink text-paper font-semibold"
									: "text-ink"
							}`}
						>
							Log in
						</button>
					</div>

					{/* Not wired up — no Google OAuth credentials configured yet. */}
					<button
						type="button"
						disabled
						className="w-full flex items-center justify-center gap-2.5 bg-surface border border-ink/16 rounded-full text-sm p-3 cursor-not-allowed text-ink/50 mb-4"
					>
						<GoogleLogo />
						Continue with Google
					</button>

					<div className="flex items-center gap-2.5 mb-4.5">
						<div className="flex-1 h-px bg-ink/12" />
						<span className="text-[11.5px] opacity-50">or</span>
						<div className="flex-1 h-px bg-ink/12" />
					</div>

					<div className="mb-3.5">
						<label className="block text-xs mb-1.5 text-ink/70">Email</label>
						<input
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="you@business.com"
							className="w-full min-h-11 px-4.5 py-2.5 text-[14.5px] text-ink bg-panel border border-ink/16 rounded-full"
						/>
					</div>
					<div className="mb-2">
						<label className="block text-xs mb-1.5 text-ink/70">Password</label>
						<input
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="••••••••"
							className="w-full min-h-11 px-4.5 py-2.5 text-[14.5px] text-ink bg-panel border border-ink/16 rounded-full"
						/>
					</div>

					{error && <p className="text-[12.5px] text-negative mt-3">{error}</p>}

					<button
						type="button"
						disabled={!ready || submitting}
						onClick={handleSubmit}
						className="w-full mt-5 text-paper font-[family-name:var(--font-display)] text-[14.5px] p-3.5 border-none rounded-full disabled:cursor-not-allowed"
						style={{
							background: ready && !submitting ? "var(--color-ink)" : "var(--color-muted)",
							cursor: ready && !submitting ? "pointer" : "not-allowed",
						}}
					>
						{submitting
							? "Please wait…"
							: authMode === "signup"
								? "Create account"
								: "Log in"}
					</button>
					<p className="text-[11.5px] opacity-55 mt-4.5 mb-0 leading-relaxed">
						By continuing, I confirm I&apos;m authorised to build a financial
						profile on this business&apos;s behalf.
					</p>
				</div>
			</div>

			<div className="flex items-center gap-2.5 px-6 sm:px-10 py-3.5 bg-ink text-paper">
				<span className="font-[family-name:var(--font-display)] text-sm">
					Onrecord
				</span>
				<span className="ml-auto text-[11.5px] opacity-60">
					SME Credit Readiness Assistant
				</span>
			</div>
		</div>
	);
}
