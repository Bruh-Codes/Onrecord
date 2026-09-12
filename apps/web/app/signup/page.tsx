"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckIcon, GoogleLogo } from "@/components/icons";
import { useToast } from "@/components/ui/Toast";
import { authClient } from "@/lib/auth-client";
import { Footer } from "@/components/ui/Footer";

export default function SignupPage() {
	const router = useRouter();
	const { toast } = useToast();
	const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [consented, setConsented] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [googleLoading, setGoogleLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const ready =
		authMode === "signup"
			? email.trim() && password.trim() && consented
			: email.trim() && password.trim();
	const busy = submitting || googleLoading;

	async function handleGoogleSignIn() {
		if (busy) return;
		setGoogleLoading(true);
		setError(null);

		// OAuth navigation leaves the page; if the request silently hangs or
		// fails instead of redirecting, recover from the stuck "Redirecting…"
		// state instead of leaving the button disabled forever.
		const timer = window.setTimeout(() => {
			setGoogleLoading(false);
			setError(
				"Google sign-in is taking longer than expected. Please try again.",
			);
			toast({
				title: "Google sign-in timed out",
				description: "Please try again.",
				tone: "error",
			});
		}, 12000);

		try {
			const { error: socialError } = await authClient.signIn.social({
				provider: "google",
				callbackURL: "/dashboard",
			});
			window.clearTimeout(timer);
			setGoogleLoading(false);
			if (socialError) {
				setError(
					socialError.message ?? "Google sign-in failed. Please try again.",
				);
				toast({ title: "Google sign-in failed", tone: "error" });
			}
		} catch {
			window.clearTimeout(timer);
			setGoogleLoading(false);
			setError("Couldn't reach Google. Please try again.");
			toast({
				title: "Google sign-in failed",
				description: "Couldn't reach Google. Please try again.",
				tone: "error",
			});
		}
	}

	async function handleSubmit() {
		if (!ready || busy) return;
		setSubmitting(true);
		setError(null);

		// Better Auth's core schema requires a `name`-we don't collect an
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

		// New sign-ups have no business yet-/setup creates one and writes
		// business_id back onto this user (see lib/link-business.ts). Login
		// goes straight home; the (app) layout redirects back here if a
		// returning user somehow still has no business_id.
		router.push(authMode === "signup" ? "/setup" : "/dashboard");
	}

	return (
		<div className="min-h-dvh flex flex-col">
			<div className="flex items-center px-6 sm:px-10 py-5.5">
				<span className="font-display text-[19px]">
					Onrecord
				</span>
			</div>

			<div className="flex-1 flex items-center justify-center p-6 sm:p-10">
				<div className="w-full max-w-[460px] bg-card rounded-3xl shadow-card p-6 sm:p-9">
					<div className="flex gap-1 bg-muted rounded-full p-1 mb-6.5">
						<button
							type="button"
							onClick={() => setAuthMode("signup")}
							disabled={busy}
							className={`flex-1 text-center py-2.5 rounded-full text-[13.5px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
								authMode === "signup"
									? "bg-foreground text-background font-semibold"
									: "text-foreground"
							}`}
						>
							Sign up
						</button>
						<button
							type="button"
							onClick={() => setAuthMode("login")}
							disabled={busy}
							className={`flex-1 text-center py-2.5 rounded-full text-[13.5px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
								authMode === "login"
									? "bg-foreground text-background font-semibold"
									: "text-foreground"
							}`}
						>
							Log in
						</button>
					</div>

					<button
						type="button"
						onClick={handleGoogleSignIn}
						disabled={busy}
						className="w-full flex items-center justify-center gap-2.5 bg-card border border-foreground/16 rounded-full text-sm p-3 hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer"
					>
						<GoogleLogo />
						{googleLoading ? "Redirecting…" : "Continue with Google"}
					</button>

					<div className="flex items-center gap-2.5 mb-4.5">
						<div className="flex-1 h-px bg-foreground/12" />
						<span className="text-[11.5px] opacity-50">or</span>
						<div className="flex-1 h-px bg-foreground/12" />
					</div>

					<div className="mb-3.5">
						<label className="block text-xs mb-1.5 text-foreground/70">Email</label>
						<input
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							disabled={busy}
							placeholder="you@business.com"
							className="w-full min-h-11 px-4.5 py-2.5 text-[14.5px] text-foreground bg-muted border border-foreground/16 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
						/>
					</div>
					<div className="mb-2">
						<label className="block text-xs mb-1.5 text-foreground/70">Password</label>
						<input
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							disabled={busy}
							placeholder="••••••••"
							className="w-full min-h-11 px-4.5 py-2.5 text-[14.5px] text-foreground bg-muted border border-foreground/16 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
						/>
					</div>

					{error && <p className="text-[12.5px] text-destructive mt-3">{error}</p>}

					{authMode === "login" && !busy && (
						<p className="text-right -mt-1.5 mb-0">
							<Link
								href="/forgot-password"
								className="text-[12px] opacity-60 hover:opacity-100"
							>
								Forgot password?
							</Link>
						</p>
					)}

					<button
						type="button"
						disabled={!ready || busy}
						onClick={handleSubmit}
						className="w-full mt-5 text-background font-display text-[14.5px] p-3.5 border-none rounded-full disabled:cursor-not-allowed"
						style={{
							background:
								ready && !submitting
									? "var(--foreground)"
									: "var(--muted-foreground)",
							cursor: ready && !submitting ? "pointer" : "not-allowed",
						}}
					>
						{submitting
							? "Please wait…"
							: authMode === "signup"
								? "Create account"
								: "Log in"}
					</button>
					<button
						type="button"
						onClick={() => setConsented((value) => !value)}
						disabled={busy}
						aria-pressed={consented}
						className="mt-4.5 flex w-full items-start gap-2.5 text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
					>
						<span
							className={`mt-[1px] flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md border transition-colors ${
								consented
									? "border-foreground bg-foreground text-background"
									: "border-foreground/30 bg-transparent text-background"
							}`}
						>
							{consented && <CheckIcon className="h-3 w-3" />}
						</span>
						<span className="text-[11.5px] leading-relaxed opacity-70">
							By continuing, I confirm I&apos;m authorised to build a financial
							profile on this business&apos;s behalf.
						</span>
					</button>
				</div>
			</div>

			<Footer />
		</div>
	);
}
