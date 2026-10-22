"use client";

import Link from "next/link";
import { formatGhs } from "@/lib/format";
import {
	useCoverage,
	useDocuments,
	useGaps,
	useMe,
	useScore,
} from "@/lib/hooks/use-business";
import { monthLabel, rangeStart, useMoneySummary } from "@/lib/money";
import { BAND_LABELS, docTypeLabel } from "@/lib/readiness";

const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function formatDate(value: string | null | undefined): string {
	if (!value) return "—";
	return dateFormatter.format(new Date(value.length === 10 ? `${value}T00:00:00Z` : value));
}

/**
 * One printable page an owner can hand to a bank or microfinance officer:
 * the last 12 months of money in and out, who pays them, the documents behind
 * the numbers and what is still missing. "Save as PDF" is the browser's print.
 */
export default function LenderSummaryPage() {
	const me = useMe();
	const { businessId } = me;
	const overall = useMoneySummary(businessId, {});
	const latest = overall.data?.latest_on ?? null;
	const summary = useMoneySummary(businessId, latest ? { from: rangeStart(latest, 12) } : {});
	const score = useScore(businessId);
	const coverage = useCoverage(businessId);
	const documents = useDocuments(businessId);
	const gaps = useGaps(businessId);

	const business = me.data?.business;
	const businessName = business?.trading_name || business?.legal_name || "Your business";

	if (!businessId || overall.isLoading || summary.isLoading) {
		return <Page><p className="text-[13px] text-foreground/55">Preparing your summary…</p></Page>;
	}
	if (overall.isError || summary.isError || !summary.data) {
		return <Page><p className="text-[13px] text-destructive">Couldn&apos;t load your records. Refresh to try again.</p></Page>;
	}
	if (!latest) {
		return (
			<Page>
				<div className="rounded-2xl border border-dashed border-foreground/25 bg-muted/50 p-8 text-center">
					<p className="m-0 text-[15px] font-semibold">Nothing to summarise yet</p>
					<p className="m-0 mt-1.5 text-[13px] text-foreground/60">
						Upload a MoMo or bank statement first. This page turns it into a summary you can print or send to a lender.
					</p>
					<Link href="/documents" className="mt-4 inline-block rounded-full bg-foreground px-4 py-2 text-[13px] text-background no-underline">
						Add records
					</Link>
				</div>
			</Page>
		);
	}

	const data = summary.data;
	const periods = data.cash_flow.periods;
	const totalIn = periods.reduce((sum, p) => sum + p.money_in_pesewas, 0);
	const totalOut = periods.reduce((sum, p) => sum + p.money_out_pesewas, 0);
	const activeMonths = periods.filter((p) => p.transactions > 0).length;
	const avgIn = activeMonths ? Math.round(totalIn / activeMonths) : 0;
	const avgOut = activeMonths ? Math.round(totalOut / activeMonths) : 0;
	const positiveMonths = periods.filter((p) => p.net_pesewas > 0).length;
	const evidence = (documents.data?.items ?? []).filter((doc) => doc.status === "extracted");
	const missing = (gaps.data ?? []).filter((gap) => gap.status === "open");
	const span = periods.length
		? `${monthLabel(periods[0].period, true)} to ${monthLabel(periods[periods.length - 1].period, true)}`
		: "—";

	return (
		<Page>
			<article className="rounded-2xl border border-border bg-card p-5 sm:p-8 print:border-0 print:p-0">
				<header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
					<div>
						<div className="text-[11px] uppercase tracking-wider text-foreground/50">Financial record summary</div>
						<h2 className="m-0 mt-1 font-display text-[26px]">{businessName}</h2>
						<div className="mt-1 text-[13px] text-foreground/65">
							{[business?.legal_name !== businessName ? business?.legal_name : null, business?.region, business?.registration_number ? `Reg. ${business.registration_number}` : null, business?.tin ? `TIN ${business.tin}` : null]
								.filter(Boolean)
								.join(" · ") || "Business details can be completed in Settings"}
						</div>
					</div>
					<div className="text-right text-[12.5px] text-foreground/65">
						<div>Period: <span className="font-semibold text-foreground">{span}</span></div>
						<div>Prepared {formatDate(new Date().toISOString())}</div>
						{score.data && (
							<div>Readiness {Math.round(score.data.total)}/100 · {BAND_LABELS[score.data.band]}</div>
						)}
					</div>
				</header>

				<section className="grid grid-cols-2 gap-4 border-b border-border py-5 sm:grid-cols-4">
					<Figure label="Money in (12 months)" value={formatGhs(totalIn)} />
					<Figure label="Money out (12 months)" value={formatGhs(totalOut)} />
					<Figure label="Average money in per month" value={formatGhs(avgIn)} />
					<Figure label="Average money out per month" value={formatGhs(avgOut)} />
					<Figure label="Months with records" value={`${activeMonths} of ${periods.length}`} />
					<Figure label="Months with more in than out" value={`${positiveMonths} of ${periods.length}`} />
					<Figure label="Unbroken statement months" value={coverage.data ? `${coverage.data.continuous_months} of ${coverage.data.analysis_window_months}` : "—"} />
					<Figure label="Net (in minus out)" value={formatGhs(totalIn - totalOut)} />
				</section>

				<section className="border-b border-border py-5">
					<h3 className="m-0 mb-3 text-[14px] font-semibold font-[family-name:var(--body-font)]">Month by month</h3>
					<div className="overflow-x-auto">
						<table className="w-full border-collapse text-[13px] tabular-nums">
							<thead>
								<tr className="text-left text-[12px] text-foreground/55">
									<th className="py-1.5 pr-3 font-normal">Month</th>
									<th className="py-1.5 pr-3 text-right font-normal">Money in</th>
									<th className="py-1.5 pr-3 text-right font-normal">Money out</th>
									<th className="py-1.5 pr-3 text-right font-normal">Net</th>
									<th className="py-1.5 text-right font-normal">Transactions</th>
								</tr>
							</thead>
							<tbody>
								{periods.map((p) => (
									<tr key={p.period} className="border-t border-foreground/8">
										<td className="py-1.5 pr-3">{monthLabel(p.period, true)}</td>
										<td className="py-1.5 pr-3 text-right">{formatGhs(p.money_in_pesewas)}</td>
										<td className="py-1.5 pr-3 text-right">{formatGhs(p.money_out_pesewas)}</td>
										<td className={`py-1.5 pr-3 text-right ${p.net_pesewas < 0 ? "text-destructive" : ""}`}>{formatGhs(p.net_pesewas)}</td>
										<td className="py-1.5 text-right">{p.transactions}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>

				<section className="grid gap-6 border-b border-border py-5 sm:grid-cols-2">
					<Ranked title="Main buyers and customers" items={data.top_customers.counterparties.slice(0, 5)} />
					<Ranked title="Main suppliers and costs" items={data.top_suppliers.counterparties.slice(0, 5)} />
				</section>

				<section className="grid gap-6 py-5 sm:grid-cols-2">
					<div>
						<h3 className="m-0 mb-2 text-[14px] font-semibold font-[family-name:var(--body-font)]">Records behind these numbers</h3>
						{evidence.length === 0 ? (
							<p className="m-0 text-[13px] text-foreground/60">No processed documents yet.</p>
						) : (
							<ul className="m-0 list-none p-0 text-[13px]">
								{evidence.map((doc) => (
									<li key={doc.id} className="flex justify-between gap-3 border-t border-foreground/8 py-1.5">
										<span className="min-w-0 truncate">{docTypeLabel(doc.doc_type)}{doc.issuer ? ` · ${doc.issuer}` : ""}</span>
										<span className="shrink-0 text-foreground/60">
											{doc.period_start ? `${formatDate(doc.period_start)} – ${formatDate(doc.period_end)}` : formatDate(doc.created_at)}
										</span>
									</li>
								))}
							</ul>
						)}
					</div>
					<div>
						<h3 className="m-0 mb-2 text-[14px] font-semibold font-[family-name:var(--body-font)]">Still being gathered</h3>
						{missing.length === 0 ? (
							<p className="m-0 text-[13px] text-foreground/60">Nothing outstanding.</p>
						) : (
							<ul className="m-0 list-disc pl-4 text-[13px] text-foreground/80">
								{missing.slice(0, 8).map((gap) => <li key={gap.id} className="py-0.5">{gap.title}</li>)}
							</ul>
						)}
					</div>
				</section>

				<footer className="border-t border-border pt-4 text-[11.5px] leading-relaxed text-foreground/55">
					Prepared with Onrecord from statements and records the owner uploaded and confirmed. Transfers between the
					owner&apos;s own accounts are left out. This is a summary of records, not an audited statement or a credit decision.
				</footer>
			</article>
		</Page>
	);
}

function Page({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex-1 min-w-0 px-4 sm:px-7 pt-6 sm:pt-7.5 pb-10 max-w-[900px] print:max-w-none print:p-0">
			<div className="mb-5 flex flex-wrap items-end justify-between gap-4 print:hidden">
				<div>
					<h1 className="text-[24px] sm:text-[28px] m-0 mb-1.5">Lender summary</h1>
					<p className="text-sm opacity-70 m-0 max-w-[560px]">
						A one-page record of your last 12 months to show a bank, microfinance officer or co-op. Save it as a PDF or print it.
					</p>
				</div>
				<button
					type="button"
					onClick={() => window.print()}
					className="cursor-pointer rounded-full border-none bg-foreground px-4 py-2 text-[13px] text-background"
				>
					Save as PDF / Print
				</button>
			</div>
			{children}
		</div>
	);
}

function Figure({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<div className="text-[11.5px] text-foreground/55">{label}</div>
			<div className="mt-0.5 text-[17px] font-semibold tabular-nums">{value}</div>
		</div>
	);
}

function Ranked({ title, items }: { title: string; items: { name: string; amount_pesewas: number; transactions: number }[] }) {
	return (
		<div>
			<h3 className="m-0 mb-2 text-[14px] font-semibold font-[family-name:var(--body-font)]">{title}</h3>
			{items.length === 0 ? (
				<p className="m-0 text-[13px] text-foreground/60">None recorded.</p>
			) : (
				<ul className="m-0 list-none p-0 text-[13px]">
					{items.map((item) => (
						<li key={item.name} className="flex justify-between gap-3 border-t border-foreground/8 py-1.5">
							<span className="min-w-0 truncate">{item.name}</span>
							<span className="shrink-0 tabular-nums">{formatGhs(item.amount_pesewas)} <span className="text-foreground/50">({item.transactions}×)</span></span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
