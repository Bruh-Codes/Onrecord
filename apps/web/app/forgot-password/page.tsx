"use client";

import { useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { authClient } from "@/lib/auth-client";
import { Footer } from "@/components/ui/Footer";

export default function ForgotPasswordPage() {
	const { toast } = useToast();
	const [email, setEmail] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [sent, setSent] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const ready = email.trim().length > 0 && !submitting;

	async function handleSubmit() {
		if (!ready) return;
		setSubmitting(true);
		setError(null);

		try {
			const { error: forgotError } = await authClient.requestPasswordReset({
				email: email.trim(),
				// Where the emailed /reset-password/<token> link lands after
				// Better Auth validates the token server-side: our password form.
				redirectTo: "/reset-password",
			});
			if (forgotError) {
				setError(forgotError.message ?? "Something went wrong. Please try again.");
				setSubmitting(false);
				return;
			}
		} catch {
			setError("Couldn't reach the server. Please try again.");
			setSubmitting(false);
			return;
		}

		// Always surface the same generic message whether or not the account
		// exists, so this endpoint can't be used to probe for registered emails.
		setSent(true);
		setSubmitting(false);
		toast({ title: "Reset link sent", tone: "success" });
	}

	return (
		<div className="min-h-dvh flex flex-col">
			<div className="flex items-center px-6 sm:px-10 py-5.5">
				<Link href="/" className="hover:opacity-100">
					<span className="font-display text-[19px]">Onrecord</span>
				</Link>
			</div>

			<div className="flex-1 flex items-center justify-center p-6 sm:p-10">
				<div className="w-full max-w-[460px] bg-card rounded-3xl shadow-card p-6 sm:p-9">
					<h1 className="font-display text-[22px] m-0 mb-1.5">
						Reset your password
					</h1>
					<p className="text-[13.5px] leading-relaxed opacity-70 m-0 mb-6">
						{`Enter the email on your account and we'll send you a
							one-time reset link that expires in an hour.`}
					</p>

					{sent ? (
						<>
							<div className="rounded-2xl bg-muted border border-foreground/16 p-5 text-[13.5px] leading-relaxed mb-6">
								{`If an account exists for ${email.trim()}, you'll find a
									reset link in your inbox shortly. Check the spam folder too.`}
							</div>
							<Link
								href="/signup"
								className="w-full inline-flex items-center justify-center text-background font-display text-[14.5px] p-3.5 rounded-full"
								style={{ background: "var(--foreground)", color: "var(--background)" }}
							>
								Back to log in
							</Link>
						</>
					) : (
						<>
							<div className="mb-3.5">
								<label className="block text-xs mb-1.5 text-foreground/70">
									Email
								</label>
								<input
									type="email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									disabled={submitting}
									placeholder="you@business.com"
									className="w-full min-h-11 px-4.5 py-2.5 text-[14.5px] text-foreground bg-muted border border-foreground/16 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
								/>
							</div>

							{error && (
								<p className="text-[12.5px] text-destructive mt-3">{error}</p>
							)}

							<button
								type="button"
								disabled={!ready}
								onClick={handleSubmit}
								className="w-full mt-5 text-background font-display text-[14.5px] p-3.5 border-none rounded-full disabled:cursor-not-allowed"
								style={{
									background: ready
										? "var(--foreground)"
										: "var(--muted-foreground)",
									cursor: ready ? "pointer" : "not-allowed",
								}}
							>
								{submitting ? "Sending…" : "Send reset link"}
							</button>

							<p className="text-center text-[12.5px] mt-4 mb-0">
								<Link
									href="/signup"
									className="opacity-70 hover:opacity-100"
								>
									Remembered it? Log in
								</Link>
							</p>
						</>
					)}
				</div>
			</div>

			<Footer />
		</div>
	);
}