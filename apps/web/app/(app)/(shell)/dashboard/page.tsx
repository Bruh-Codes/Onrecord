"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GetStartedCard } from "@/components/home/GetStartedCard";
import { GoogleSheetsConnect } from "@/components/integrations/GoogleSheetsConnect";
import { useAppState } from "@/lib/app-state";
import { authClient } from "@/lib/auth-client";
import { formatGhs } from "@/lib/format";
import {
	useMe,
	useScore,
	useCoverage,
	useChecklist,
	useGaps,
	useDocuments,
} from "@/lib/hooks/use-business";
import { monthLabel, useMoneySummary } from "@/lib/money";
import { askOna } from "@/lib/ona";
import { BAND_LABELS, buildNextSteps } from "@/lib/readiness";

export default function HomePage() {
	const state = useAppState();
	const { data: session } = authClient.useSession();
	const ownerFirstName = session?.user?.name?.split(" ")[0];
	const { businessId } = useMe();
	const [googleSheetsConnected, setGoogleSheetsConnected] = useState(false);
	const score = useScore(businessId);
	const coverage = useCoverage(businessId);
	const gaps = useGaps(businessId);
	const checklist = useChecklist(businessId);
	const documents = useDocuments(businessId);
	const money = useMoneySummary(businessId, {});
	// Until the first document exists, keep the home state safe for a fresh account.
	// This also avoids showing seeded actions if the documents request is unavailable.
	const isNewUser = !documents.data || documents.data.total === 0;
	const nextSteps = buildNextSteps(gaps.data, checklist.data).slice(0, 3);

	useEffect(() => {
		let active = true;
		void fetch("/api/integrations/google-sheets/status")
			.then(async (response) => {
				if (!response.ok) return;
				const data = (await response.json()) as { connected?: boolean };
				if (active) setGoogleSheetsConnected(Boolean(data.connected));
			})
			.catch(() => undefined);
		return () => {
			active = false;
		};
	}, []);

	const periods = money.data?.cash_flow.periods ?? [];
	const lastMonth = periods.at(-1);
	const prevMonth = periods.at(-2);
	const awaitingReview = money.data?.documents_awaiting_review ?? 0;

	return (
		<div className="px-4 sm:px-7 pt-6 sm:pt-7.5 pb-10 max-w-[1100px]">
			{state.draftMode && (
				<div className="bg-accent text-[#2a2a2a] text-[12.5px] px-4 py-2.5 rounded-xl mb-4.5">
					Draft mode is on-this profile is not visible to reviewers yet. Turn it
					off when you&apos;re ready to share.
				</div>
			)}
			<h1 className="text-[24px] sm:text-[30px] m-0 mb-1.5">
				Welcome back{ownerFirstName ? `, ${ownerFirstName}` : ""}!
			</h1>
			<p className="text-[14.5px] text-muted-foreground m-0 mb-6">
				{isNewUser
					? "Add your MoMo or bank statements and we'll turn them into a record a lender can read."
					: "Here's where your money and your loan file stand."}
			</p>

			{awaitingReview > 0 && (
				<div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/35 bg-warning/10 px-4 py-3 text-[13px]" role="status">
					<span>
						{awaitingReview === 1 ? "1 upload has" : `${awaitingReview} uploads have`} rows waiting for you to check before they count.
					</span>
					<Link href="/documents" className="font-semibold underline underline-offset-2">Check rows</Link>
				</div>
			)}

			{!isNewUser && (
				<div className="grid gap-3 mb-6 md:grid-cols-3">
					<Link href="/money" className="rounded-2xl border border-border bg-card p-4 no-underline text-foreground hover:border-foreground/30">
						<div className="text-[12.5px] text-foreground/60">
							{lastMonth ? `Money in, ${monthLabel(lastMonth.period, true)}` : "Money in"}
						</div>
						<div className="mt-1 font-display text-[24px] leading-tight tabular-nums text-positive">
							{lastMonth ? formatGhs(lastMonth.money_in_pesewas) : "—"}
						</div>
						<div className="mt-1 text-[12px] text-foreground/60">
							{lastMonth
								? `Out ${formatGhs(lastMonth.money_out_pesewas)}${prevMonth ? ` · ${changeText(lastMonth.money_in_pesewas, prevMonth.money_in_pesewas)} vs ${monthLabel(prevMonth.period)}` : ""}`
								: "No confirmed transactions yet"}
						</div>
					</Link>
					<Link href="/readiness" className="rounded-2xl border border-border bg-card p-4 no-underline text-foreground hover:border-foreground/30">
						<div className="text-[12.5px] text-foreground/60">Loan readiness</div>
						<div className="mt-1 font-display text-[24px] leading-tight tabular-nums">
							{score.data ? `${Math.round(score.data.total)}` : "—"}
							<span className="text-[14px] text-foreground/50"> / 100</span>
						</div>
						<div className="mt-1 text-[12px] text-foreground/60">
							{score.data ? `${BAND_LABELS[score.data.band]} · not a credit decision` : "Calculated after your first statement"}
						</div>
					</Link>
					<Link href="/documents" className="rounded-2xl border border-border bg-card p-4 no-underline text-foreground hover:border-foreground/30">
						<div className="text-[12.5px] text-foreground/60">Statement history</div>
						<div className="mt-1 font-display text-[24px] leading-tight tabular-nums">
							{coverage.data ? coverage.data.continuous_months : "—"}
							<span className="text-[14px] text-foreground/50"> of {coverage.data?.analysis_window_months ?? 12} months</span>
						</div>
						<div className="mt-1 text-[12px] text-foreground/60">
							{coverage.data && coverage.data.continuous_months >= coverage.data.analysis_window_months
								? "A full year, no breaks"
								: "Lenders look for 6–12 months without breaks"}
						</div>
					</Link>
				</div>
			)}

			{!isNewUser && nextSteps.length > 0 && (
				<section className="mb-6 rounded-2xl border border-border bg-card p-4 sm:p-5">
					<div className="mb-2 flex items-baseline justify-between gap-3">
						<h2 className="m-0 text-[15px] font-semibold font-[family-name:var(--body-font)]">Next steps for your loan file</h2>
						<Link href="/readiness" className="text-[12.5px] underline underline-offset-2">See all</Link>
					</div>
					<ul className="m-0 list-none p-0">
						{nextSteps.map((step) => (
							<li key={step.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-foreground/8 py-2.5 first:border-t-0">
								<span className="text-[13.5px]">{step.title}</span>
								<span className="flex gap-2">
									{step.action === "upload" && (
										<Link href="/documents" className="rounded-full bg-foreground px-3 py-1 text-[12px] text-background no-underline">Upload</Link>
									)}
									<button type="button" onClick={() => askOna(step.prompt)} className="cursor-pointer rounded-full border border-foreground/16 bg-transparent px-3 py-1 text-[12px] text-foreground">
										Ask Ona
									</button>
								</span>
							</li>
						))}
					</ul>
				</section>
			)}

			<Link href="/farm" className="block rounded-2xl border border-border bg-card p-5 mb-6">
				<span className="text-primary font-semibold">Open your farm finance workspace →</span>
				<span className="block text-sm text-muted-foreground mt-1">Record farm income and costs, compare enterprises, and prepare a financial report.</span>
			</Link>

			<GetStartedCard
				hasData={!isNewUser}
				googleSheets={googleSheetsConnected ? <GoogleSheetsConnect /> : undefined}
			/>
		</div>
	);
}

function changeText(current: number, previous: number): string {
	if (previous <= 0) return "new";
	const pct = Math.round(((current - previous) / previous) * 100);
	return pct === 0 ? "same" : `${pct > 0 ? "+" : ""}${pct}%`;
}
