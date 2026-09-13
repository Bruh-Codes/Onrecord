"use client";

import { useState } from "react";
import { CheckIcon, GoogleLogo } from "@/components/icons";
import { useToast } from "@/components/ui/Toast";
import { authClient } from "@/lib/auth-client";
import { Footer } from "@/components/ui/Footer";

export default function SignupPage() {
	const { toast } = useToast();
	const [consented, setConsented] = useState(true);
	const [googleLoading, setGoogleLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const busy = googleLoading;

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

	return (
		<div className="min-h-dvh flex flex-col">
			<div className="flex items-center px-6 sm:px-10 py-5.5">
				<span className="font-display text-[19px]">
					Onrecord
				</span>
			</div>

			<div className="flex-1 flex items-center justify-center p-6 sm:p-10">
				<div className="w-full max-w-[460px] bg-card rounded-3xl shadow-card p-6 sm:p-9">
					<h1 className="m-0 mb-2 text-center font-display text-2xl">Continue with Google</h1>
					<p className="m-0 mb-6 text-center text-sm opacity-65">
						Create an account or sign in securely with your Google account.
					</p>

					<button
						type="button"
						onClick={handleGoogleSignIn}
						disabled={!consented || busy}
						className="w-full flex items-center justify-center gap-2.5 bg-card border border-foreground/16 rounded-full text-sm p-3 hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer"
					>
						<GoogleLogo />
						{googleLoading ? "Redirecting…" : "Continue with Google"}
					</button>

					{error && <p className="text-[12.5px] text-destructive mt-3">{error}</p>}

					{/* Email/password authentication remains configured in Better Auth.
					    Its sign-in, sign-up, and reset UI are intentionally retired for now. */}
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
