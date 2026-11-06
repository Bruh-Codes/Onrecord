"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckIcon, GoogleLogo } from "@/components/icons";
import { useToast } from "@/components/ui/Toast";
import { authClient } from "@/lib/auth-client";
import { Footer } from "@/components/ui/Footer";
import { BrandLink } from "@/components/ui/BrandLink";

function SignupForm() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { toast } = useToast();
	const [authMode, setAuthMode] = useState<"signup" | "login">(() => searchParams.get("mode") === "login" ? "login" : "signup");
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [consented, setConsented] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [googleLoading, setGoogleLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const ready = authMode === "signup"
		? name.trim() && email.trim() && password.trim()
		: email.trim() && password.trim();
	const busy = submitting || googleLoading;

	async function handleSubmit() {
		if (!ready || busy) return;
		if (authMode === "signup" && !consented) {
			setError("Tick the box to confirm this is your business.");
			return;
		}
		setSubmitting(true);
		setError(null);
		if (authMode === "signup") {
			// Create the account now so it isn't lost if the owner leaves setup.
			// Until a business exists, the app sends them back to /setup.
			const { error: signUpError } = await authClient.signUp.email({
				name: name.trim(),
				email: email.trim(),
				password,
			});
			if (signUpError) {
				setError(signUpError.message ?? "Couldn't create your account. Please try again.");
				setSubmitting(false);
				return;
			}
			router.push("/setup");
			return;
		}
		const { error: authError } = await authClient.signIn.email({ email, password });
		if (authError) {
			setError(authError.message ?? "Something went wrong. Please try again.");
			setSubmitting(false);
			return;
		}
		const callbackURL = searchParams.get("callbackURL") ?? "/dashboard";
		router.push(callbackURL.startsWith("/") ? callbackURL : "/dashboard");
	}

	async function handleGoogleSignIn() {
		if (busy) return;
		if (authMode === "signup" && !consented) {
			setError("Tick the box to confirm this is your business.");
			return;
		}
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
				callbackURL: searchParams.get("callbackURL") ?? "/dashboard",
				// First-time Google users have no business yet; /setup creates it.
				newUserCallbackURL: "/setup",
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

	return (
		<div className="min-h-dvh flex flex-col">
			<div className="flex items-center px-6 sm:px-10 py-5.5">
				<BrandLink />
			</div>

			<div className="flex-1 flex items-center justify-center p-6 sm:p-10">
				<div className="w-full max-w-[460px] bg-card rounded-3xl shadow-card p-6 sm:p-9">
					<div className="flex gap-1 bg-muted rounded-full p-1 mb-6.5">
						<button type="button" onClick={() => setAuthMode("signup")} disabled={busy} className={`flex-1 text-center py-2.5 rounded-full text-[13.5px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${authMode === "signup" ? "bg-foreground text-background font-semibold" : "text-foreground"}`}>Sign up</button>
						<button type="button" onClick={() => setAuthMode("login")} disabled={busy} className={`flex-1 text-center py-2.5 rounded-full text-[13.5px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${authMode === "login" ? "bg-foreground text-background font-semibold" : "text-foreground"}`}>Log in</button>
					</div>

					<button
						type="button"
						onClick={handleGoogleSignIn}
						disabled={busy}
						className="w-full flex items-center justify-center gap-2.5 bg-card border border-foreground/16 rounded-full text-sm p-3 hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer"
					>
						<GoogleLogo />
						{googleLoading ? "Redirecting…" : authMode === "signup" ? "Sign up with Google" : "Continue with Google"}
					</button>

					<div className="flex items-center gap-2.5 my-4.5"><div className="flex-1 h-px bg-foreground/12" /><span className="text-[11.5px] opacity-50">or use email</span><div className="flex-1 h-px bg-foreground/12" /></div>
					{authMode === "signup" && (
						<div className="mb-3.5">
							<label className="block text-xs mb-1.5 text-foreground/70">Your name</label>
							<input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} autoComplete="name" placeholder="e.g. Ama Mensah" className="w-full min-h-11 px-4.5 py-2.5 text-[14.5px] text-foreground bg-muted border border-foreground/16 rounded-full disabled:opacity-50 disabled:cursor-not-allowed" />
						</div>
					)}
					<div className="mb-3.5">
						<label className="block text-xs mb-1.5 text-foreground/70">Email</label>
						<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} placeholder="you@business.com" className="w-full min-h-11 px-4.5 py-2.5 text-[14.5px] text-foreground bg-muted border border-foreground/16 rounded-full disabled:opacity-50 disabled:cursor-not-allowed" />
					</div>
					<div className="mb-2">
						<label className="block text-xs mb-1.5 text-foreground/70">Password</label>
						<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} placeholder={authMode === "signup" ? "At least 8 characters" : "••••••••"} className="w-full min-h-11 px-4.5 py-2.5 text-[14.5px] text-foreground bg-muted border border-foreground/16 rounded-full disabled:opacity-50 disabled:cursor-not-allowed" />
					</div>
					{error && <p className="text-[12.5px] text-destructive mt-3">{error}</p>}

					{authMode === "login" && !busy && <p className="text-right -mt-1.5 mb-0"><Link href="/forgot-password" className="text-[12px] opacity-60 hover:opacity-100">Forgot password?</Link></p>}
					{authMode === "signup" && <ConsentCheckbox checked={consented} disabled={busy} onToggle={() => { setConsented((value) => !value); setError(null); }} />}
					<button type="button" disabled={!ready || busy} onClick={handleSubmit} className="w-full mt-5 text-background font-display text-[14.5px] p-3.5 border-none rounded-full disabled:cursor-not-allowed" style={{ background: ready && !submitting ? "var(--foreground)" : "var(--muted-foreground)", cursor: ready && !submitting ? "pointer" : "not-allowed" }}>
						{submitting ? "Please wait…" : authMode === "signup" ? "Create account" : "Log in"}
					</button>
					{authMode === "signup" && (
						<p className="text-[12px] text-center opacity-65 mt-3.5 mb-0">
							By creating an account you agree to our{" "}
							<Link href="/terms" className="underline underline-offset-2">Terms of Use</Link> and{" "}
							<Link href="/privacy" className="underline underline-offset-2">Privacy Policy</Link>.
						</p>
					)}
				</div>
			</div>

			<Footer />
		</div>
	);
}

function ConsentCheckbox({ checked, disabled, onToggle }: { checked: boolean; disabled: boolean; onToggle: () => void }) {
	return (
		<button
			type="button"
			onClick={onToggle}
			disabled={disabled}
			aria-pressed={checked}
			className="mt-4 flex w-full items-start gap-2.5 text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
		>
			<span
				className={`mt-[1px] flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md border transition-colors ${
					checked
						? "border-foreground bg-foreground text-background"
						: "border-foreground/30 bg-transparent text-background"
				}`}
			>
				{checked && <CheckIcon className="h-3 w-3" />}
			</span>
			<span className="text-[12.5px] leading-relaxed opacity-80">
				I own this business or I&apos;m allowed to manage its records.
			</span>
		</button>
	);
}

export default function SignupPage() {
	return (
		<Suspense fallback={null}>
			<SignupForm />
		</Suspense>
	);
}
