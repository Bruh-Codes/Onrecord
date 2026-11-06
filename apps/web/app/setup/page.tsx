"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { linkBusiness } from "@/lib/link-business";
import { authClient } from "@/lib/auth-client";
import { SECTOR_OPTIONS } from "@/lib/sectors";
import { BrandLink } from "@/components/ui/BrandLink";

const ENTITY_TYPES: { value: string; label: string }[] = [
	{ value: "sole_prop", label: "Just me (sole proprietor)" },
	{ value: "partnership", label: "Partnership" },
	{ value: "ltd", label: "Limited company" },
	{ value: "ngo", label: "NGO or association" },
];

export default function SetupPage() {
	const router = useRouter();
	const { data: session, isPending: sessionPending } = authClient.useSession();
	const [legalName, setLegalName] = useState("");
	const [entityType, setEntityType] = useState("sole_prop");
	const [sector, setSector] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const ready = legalName.trim().length > 0 && !sessionPending && Boolean(session);

	useEffect(() => {
		// The account is created on the sign-up page; setup only adds the business.
		if (!sessionPending && !session) router.replace("/signup");
	}, [router, session, sessionPending]);

	async function handleSubmit() {
		if (!ready || submitting) return;
		setSubmitting(true);
		setError(null);
		try {
			const business = await api.createBusiness({
				legal_name: legalName.trim(),
				entity_type: entityType,
				sector_code: sector || null,
			});
			await linkBusiness(business.id);
			// The server-side gate in app/(app)/layout.tsx resolves businessId
			// from the auth_user row itself, so no session refresh is needed —
			// the owner won't be bounced back here on the next navigation.
			router.push("/dashboard");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
			setSubmitting(false);
		}
	}

	return (
		<div className="min-h-dvh flex flex-col">
			<div className="flex items-center px-6 py-5 sm:px-10">
				<BrandLink />
			</div>

			<div className="flex-1 flex items-center justify-center p-6 sm:p-10">
				<div className="w-full max-w-[460px] bg-card rounded-3xl shadow-card p-6 sm:p-9">
					<h1 className="text-[22px] m-0 mb-1.5">Tell us about your business</h1>
					<p className="text-[13px] opacity-70 m-0 mb-6.5">
						Three quick questions. You can change them later in Settings.
					</p>

					<div className="mb-3.5">
						<label className="block text-xs mb-1.5 text-foreground/70">Business name</label>
						<input
							value={legalName}
							onChange={(e) => setLegalName(e.target.value)}
							placeholder="e.g. Adom Provisions"
							className="w-full min-h-11 px-4.5 py-2.5 text-[14.5px] text-foreground bg-muted border border-foreground/16 rounded-full"
						/>
					</div>

					<div className="mb-3.5">
						<label className="block text-xs mb-1.5 text-foreground/70">What does your business do?</label>
						<select
							value={sector}
							onChange={(e) => setSector(e.target.value)}
							className="w-full min-h-11 px-4.5 py-2.5 text-[14.5px] text-foreground bg-muted border border-foreground/16 rounded-full"
						>
							<option value="">Choose one</option>
							{SECTOR_OPTIONS.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</div>

					<div className="mb-2">
						<label className="block text-xs mb-1.5 text-foreground/70">Who owns it?</label>
						<select
							value={entityType}
							onChange={(e) => setEntityType(e.target.value)}
							className="w-full min-h-11 px-4.5 py-2.5 text-[14.5px] text-foreground bg-muted border border-foreground/16 rounded-full"
						>
							{ENTITY_TYPES.map((t) => (
								<option key={t.value} value={t.value}>
									{t.label}
								</option>
							))}
						</select>
					</div>

					{error && <p className="text-[12.5px] text-destructive mt-3">{error}</p>}

					<button
						type="button"
						disabled={!ready || submitting}
						onClick={handleSubmit}
						className="w-full mt-5 text-background font-display text-[14.5px] p-3.5 border-none rounded-full disabled:cursor-not-allowed"
						style={{
							background: ready && !submitting ? "var(--foreground)" : "var(--muted-foreground)",
							cursor: ready && !submitting ? "pointer" : "not-allowed",
						}}
					>
						{submitting ? "Please wait…" : "Continue"}
					</button>
				</div>
			</div>
		</div>
	);
}
