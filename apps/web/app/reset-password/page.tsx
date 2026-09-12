"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { authClient } from "@/lib/auth-client";
import { Footer } from "@/components/ui/Footer";

function ResetPasswordForm() {
	const searchParams = useSearchParams();
	const token = searchParams.get("token");
	const { toast } = useToast();
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState(false);

	const invalid = !token;
	const ready =
		!invalid &&
		!submitting &&
		password.length >= 8 &&
		confirm.length > 0 &&
		password === confirm;

	async function handleSubmit() {
		if (!ready || !token) return;
		setSubmitting(true);
		setError(null);

		const { error: resetError } = await authClient.resetPassword({
			newPassword: password,
			token,
		});

		if (resetError) {
			// One message for missing/expired/used tokens: never leak why.
			setError(
				"This reset link is invalid or has expired. Request a new one to continue.",
			);
			setSubmitting(false);
			return;
		}

		setDone(true);
		setSubmitting(false);
		toast({ title: "Password updated", tone: "success" });
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
					{invalid ? (
						<>
							<h1 className="font-display text-[22px] m-0 mb-1.5">
								Invalid or expired link
							</h1>
							<p className="text-[13.5px] leading-relaxed opacity-70 m-0 mb-6">
								{"This password-reset link is missing, already used, or has "
									+ "expired. Request a fresh link and try again."}
							</p>
							<Link
								href="/forgot-password"
								className="w-full inline-flex items-center justify-center text-background font-display text-[14.5px] p-3.5 rounded-full"
								style={{ background: "var(--foreground)", color: "var(--background)" }}
							>
								Request a new link
							</Link>
						</>
					) : done ? (
						<>
							<h1 className="font-display text-[22px] m-0 mb-1.5">
								Password updated
							</h1>
							<p className="text-[13.5px] leading-relaxed opacity-70 m-0 mb-6">
								Your password has been changed. You can now log in with the
								new one.
							</p>
							<Link
								href="/signup"
								className="w-full inline-flex items-center justify-center text-background font-display text-[14.5px] p-3.5 rounded-full"
								style={{ background: "var(--foreground)", color: "var(--background)" }}
							>
								Go to log in
							</Link>
						</>
					) : (
						<>
							<h1 className="font-display text-[22px] m-0 mb-1.5">
								Choose a new password
							</h1>
							<p className="text-[13.5px] leading-relaxed opacity-70 m-0 mb-6">
								{"Pick something strong — at least 8 characters — that you "
									+ "haven't used for this account before."}
							</p>

							<div className="mb-3.5">
								<label className="block text-xs mb-1.5 text-foreground/70">
									New password
								</label>
								<input
									type="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									disabled={submitting}
									placeholder="••••••••"
									className="w-full min-h-11 px-4.5 py-2.5 text-[14.5px] text-foreground bg-muted border border-foreground/16 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
								/>
							</div>
							<div className="mb-2">
								<label className="block text-xs mb-1.5 text-foreground/70">
									Confirm new password
								</label>
								<input
									type="password"
									value={confirm}
									onChange={(e) => setConfirm(e.target.value)}
									disabled={submitting}
									placeholder="••••••••"
									className="w-full min-h-11 px-4.5 py-2.5 text-[14.5px] text-foreground bg-muted border border-foreground/16 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
								/>
							</div>
							{confirm.length > 0 && password !== confirm && (
								<p className="text-[12.5px] text-destructive mt-2">
									Passwords don&apos;t match.
								</p>
							)}
							{password.length > 0 && password.length < 8 && (
								<p className="text-[12.5px] text-destructive mt-2">
									Use at least 8 characters.
								</p>
							)}

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
								{submitting ? "Updating…" : "Reset password"}
							</button>
						</>
					)}
				</div>
			</div>

			<Footer />
		</div>
	);
}

export default function ResetPasswordPage() {
	return (
		<Suspense fallback={null}>
			<ResetPasswordForm />
		</Suspense>
	);
}