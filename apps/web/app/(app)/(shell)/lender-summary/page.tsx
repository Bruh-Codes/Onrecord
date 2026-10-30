"use client";

import Image from "next/image";
import Link from "next/link";
import iconDark from "@/public/icon-dark.png";
import { formatGhs } from "@/lib/format";
import {
	useCoverage,
	useDocuments,
	useGaps,
	useMe,
} from "@/lib/hooks/use-business";
import { monthLabel, rangeStart, useMoneySummary } from "@/lib/money";
import { docTypeLabel, gapTitle } from "@/lib/readiness";
import { sectorLabel } from "@/lib/sectors";
import { taxStatusForLender } from "@/lib/tax";

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
	const totalCount = periods.reduce((sum, p) => sum + p.transactions, 0);
	const activeMonths = periods.filter((p) => p.transactions > 0).length;
	const avgIn = activeMonths ? Math.round(totalIn / activeMonths) : 0;
	const avgOut = activeMonths ? Math.round(totalOut / activeMonths) : 0;
	const positiveMonths = periods.filter((p) => p.net_pesewas > 0).length;
	const peakIn = Math.max(1, ...periods.map((p) => p.money_in_pesewas));
	const taxPaid = data.categories.money_out.find((row) => row.category === "tax");
	const taxStatus = taxStatusForLender(business?.tax_status?.value);
	const evidence = (documents.data?.items ?? []).filter((doc) => doc.status === "extracted");
	const missing = (gaps.data ?? []).filter((gap) => gap.status === "open");
	const span = periods.length
		? `${monthLabel(periods[0].period, true)} – ${monthLabel(periods[periods.length - 1].period, true)}`
		: "—";
	const reference = businessId.replaceAll("-", "").slice(-8).toUpperCase();
	const identity = [
		sectorLabel(business?.sector_code),
		business?.region,
		business?.legal_name !== businessName ? business?.legal_name : null,
	].filter(Boolean);
	const tagged = data.farm?.groups ?? [];

	return (
		<Page printable>
			<article className="paper mx-auto overflow-hidden rounded-[18px] border border-border bg-background text-foreground shadow-card print:rounded-none print:border-0 print:shadow-none">
				<div className="h-1.5 bg-positive" aria-hidden="true" />
				<div className="px-6 py-7 sm:px-10 sm:py-9 print:px-0 print:py-0">
					<header className="flex flex-wrap items-start justify-between gap-6">
						<div className="flex items-center gap-2.5">
							<Image src={iconDark} alt="" width={22} height={22} />
							<span className="font-display text-[15px]">Onrecord</span>
						</div>
						<div className="text-right text-[11.5px] leading-relaxed text-foreground/60">
							<div className="font-semibold uppercase tracking-[0.12em] text-foreground/80">Financial record summary</div>
							<div>Prepared {formatDate(new Date().toISOString())} · Ref {reference}</div>
						</div>
					</header>

					<section className="mt-8 flex flex-wrap items-end justify-between gap-5 border-b border-border pb-6">
						<div className="min-w-0">
							<h2 className="m-0 font-display text-[30px] leading-tight sm:text-[34px]">{businessName}</h2>
							{identity.length > 0 && <div className="mt-1.5 text-[13.5px] text-foreground/70">{identity.join(" · ")}</div>}
							<dl className="m-0 mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[12.5px]">
								<Field label="Registration" value={business?.registration_number ?? "Not given"} />
								<Field label="TIN" value={business?.tin ?? "Not given"} />
							</dl>
						</div>
						<div className="rounded-xl border border-border px-4 py-3 text-right">
							<div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-foreground/55">Period covered</div>
							<div className="mt-0.5 text-[14px] font-semibold">{span}</div>
							<div className="text-[11.5px] text-foreground/60">{activeMonths} month{activeMonths === 1 ? "" : "s"} with activity</div>
						</div>
					</section>

					<section className="mt-6 grid grid-cols-2 overflow-hidden rounded-xl border border-border sm:grid-cols-4">
						<Headline label="Money in" value={formatGhs(totalIn)} note={`${formatGhs(avgIn)} a month on average`} tone="in" />
						<Headline label="Money out" value={formatGhs(totalOut)} note={`${formatGhs(avgOut)} a month on average`} />
						<Headline label="Net (in minus out)" value={formatGhs(totalIn - totalOut)} note={`${positiveMonths} of ${periods.length} months positive`} tone={totalIn - totalOut < 0 ? "negative" : undefined} />
						<Headline label="Unbroken statement months" value={coverage.data ? `${coverage.data.continuous_months} of ${coverage.data.analysis_window_months}` : "—"} note="Bank or MoMo, no gaps" />
					</section>

					<Section title="Month by month" note="Transfers between the owner's own accounts are left out.">
						<div className="overflow-x-auto">
							<table className="w-full min-w-[520px] border-collapse text-[12.5px] tabular-nums">
								<thead>
									<tr className="border-b border-border text-left text-[10.5px] uppercase tracking-[0.08em] text-foreground/55">
										<th className="py-2 pr-3 font-semibold">Month</th>
										<th className="py-2 pr-3 font-semibold">Money in</th>
										<th className="py-2 pr-3 text-right font-semibold">Money out</th>
										<th className="py-2 pr-3 text-right font-semibold">Net</th>
										<th className="py-2 text-right font-semibold">Transactions</th>
									</tr>
								</thead>
								<tbody>
									{periods.map((p) => (
										<tr key={p.period} className="border-b border-foreground/8">
											<td className="py-2 pr-3">{monthLabel(p.period, true)}</td>
											<td className="py-2 pr-3">
												<div className="flex items-center gap-2.5">
													<span className="w-[84px] shrink-0">{formatGhs(p.money_in_pesewas)}</span>
													<span className="h-1.5 flex-1 rounded-full bg-foreground/6" aria-hidden="true">
														<span className="block h-full rounded-full bg-positive" style={{ width: `${(p.money_in_pesewas / peakIn) * 100}%` }} />
													</span>
												</div>
											</td>
											<td className="py-2 pr-3 text-right">{formatGhs(p.money_out_pesewas)}</td>
											<td className={`py-2 pr-3 text-right ${p.net_pesewas < 0 ? "text-destructive" : ""}`}>{formatGhs(p.net_pesewas)}</td>
											<td className="py-2 text-right text-foreground/70">{p.transactions}</td>
										</tr>
									))}
								</tbody>
								<tfoot>
									<tr className="font-semibold">
										<td className="pt-2.5 pr-3">Total</td>
										<td className="pt-2.5 pr-3">{formatGhs(totalIn)}</td>
										<td className="pt-2.5 pr-3 text-right">{formatGhs(totalOut)}</td>
										<td className={`pt-2.5 pr-3 text-right ${totalIn - totalOut < 0 ? "text-destructive" : ""}`}>{formatGhs(totalIn - totalOut)}</td>
										<td className="pt-2.5 text-right">{totalCount}</td>
									</tr>
								</tfoot>
							</table>
						</div>
					</Section>

					<section className="mt-8 grid gap-8 sm:grid-cols-2 print:grid-cols-2">
						<Ranked title="Main customers" items={data.top_customers.counterparties.slice(0, 5)} />
						<Ranked title="Main suppliers" items={data.top_suppliers.counterparties.slice(0, 5)} />
					</section>

					{tagged.length > 0 && (
						<Section title="By product or service" note="Money in minus money out for records the owner tagged. Not profit: unpaid bills and stock on hand are not included.">
							<div className="overflow-x-auto">
								<table className="w-full min-w-[520px] border-collapse text-[12.5px] tabular-nums">
									<thead>
										<tr className="border-b border-border text-left text-[10.5px] uppercase tracking-[0.08em] text-foreground/55">
											<th className="py-2 pr-3 font-semibold">Product or service · season</th>
											<th className="py-2 pr-3 text-right font-semibold">Money in</th>
											<th className="py-2 pr-3 text-right font-semibold">Money out</th>
											<th className="py-2 pr-3 text-right font-semibold">Left over</th>
											<th className="py-2 text-right font-semibold">Typed in by owner</th>
										</tr>
									</thead>
									<tbody>
										{tagged.map((group) => (
											<tr key={`${group.farm_activity}|${group.season}`} className="border-b border-foreground/8">
												<td className="py-2 pr-3">{[group.farm_activity ?? "No product given", group.season ?? "no season or batch"].join(" · ")}</td>
												<td className="py-2 pr-3 text-right">{formatGhs(group.money_in_pesewas)}</td>
												<td className="py-2 pr-3 text-right">{formatGhs(group.money_out_pesewas)}</td>
												<td className={`py-2 pr-3 text-right font-semibold ${group.left_over_pesewas < 0 ? "text-destructive" : ""}`}>{formatGhs(group.left_over_pesewas)}</td>
												<td className="py-2 text-right text-foreground/70">{group.typed_in_by_owner} of {group.transactions}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</Section>
					)}

					<Section title="Tax">
						<dl className="m-0 grid gap-x-8 gap-y-2 rounded-xl bg-muted/70 px-4 py-3.5 text-[12.5px] sm:grid-cols-3 print:grid-cols-3">
							<Field label="TIN or Ghana Card" value={business?.tin ?? "Not given"} stacked />
							<Field label="Tax status (owner's answer)" value={taxStatus ?? "Not given"} stacked />
							<Field
								label="Tax, SSNIT and assembly payments"
								value={taxPaid ? `${formatGhs(taxPaid.amount_pesewas)} (${taxPaid.transactions} payment${taxPaid.transactions === 1 ? "" : "s"})` : "None found in these records"}
								stacked
							/>
						</dl>
					</Section>

					<section className="mt-8 grid gap-8 sm:grid-cols-2 print:grid-cols-2">
						<div>
							<SectionTitle>Records behind these numbers</SectionTitle>
							{evidence.length === 0 ? (
								<p className="m-0 text-[12.5px] text-foreground/60">No processed documents yet.</p>
							) : (
								<ul className="m-0 list-none p-0 text-[12.5px]">
									{evidence.map((doc) => {
										const typed = Boolean(doc.quality_flags?.hand_entered);
										return (
											<li key={doc.id} className="flex items-baseline justify-between gap-3 border-b border-foreground/8 py-2">
												<span className="min-w-0">
													<span className="block truncate">
														{typed ? `Records typed in by the owner (${doc.transaction_count ?? 0})` : `${docTypeLabel(doc.doc_type)}${doc.issuer ? ` · ${doc.issuer}` : ""}`}
													</span>
													<span className="text-[11px] text-foreground/55">{evidenceKind(doc.doc_type, typed)}</span>
												</span>
												<span className="shrink-0 text-foreground/60 tabular-nums">
													{doc.period_start ? `${formatDate(doc.period_start)} – ${formatDate(doc.period_end)}` : formatDate(doc.created_at)}
												</span>
											</li>
										);
									})}
								</ul>
							)}
						</div>
						<div>
							<SectionTitle>Still being gathered</SectionTitle>
							{missing.length === 0 ? (
								<p className="m-0 text-[12.5px] text-foreground/60">Nothing outstanding.</p>
							) : (
								<ul className="m-0 list-none p-0 text-[12.5px]">
									{missing.slice(0, 8).map((gap) => (
										<li key={gap.id} className="flex gap-2 border-b border-foreground/8 py-2">
											<span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/35" aria-hidden="true" />
											{gapTitle(gap)}
										</li>
									))}
								</ul>
							)}
						</div>
					</section>

					<footer className="mt-9 border-t border-border pt-4 text-[10.5px] leading-relaxed text-foreground/55">
						<p className="m-0">
							Prepared with Onrecord from bank and MoMo statements and other records the owner uploaded and confirmed. Records the owner typed
							in themselves, such as cash sales, are counted and marked as typed in. Transfers between the owner&apos;s own accounts are left
							out. Tax payments are those the records show and are not a tax clearance. This is a summary of records, not an audited
							statement or a credit decision.
						</p>
						<p className="m-0 mt-2 flex justify-between gap-4 text-foreground/45">
							<span>Ref {reference}</span>
							<span>Onrecord · financial records for small businesses in Ghana</span>
						</p>
					</footer>
				</div>
			</article>
		</Page>
	);
}

function evidenceKind(docType: string | null | undefined, typed: boolean): string {
	if (typed) return "Owner's own record";
	if (docType === "bank_statement" || docType === "momo_statement" || docType === "momo_merchant_statement") return "Statement from the provider";
	if (docType === "receipt" || docType === "invoice_issued" || docType === "invoice_received") return "Supporting document";
	return "Document";
}

function Page({ children, printable = false }: { children: React.ReactNode; printable?: boolean }) {
	return (
		<div className="flex-1 min-w-0 px-4 sm:px-7 pt-6 sm:pt-7.5 pb-10 max-w-[940px] print:max-w-none print:p-0">
			<div className="mb-5 print:hidden">
				<h1 className="text-[24px] sm:text-[28px] m-0 mb-1.5">Lender summary</h1>
				<p className="text-sm opacity-70 m-0 max-w-[560px]">
					A one-page record of your last 12 months to show a bank, microfinance officer or co-op.
				</p>
				{printable && (
					<div className="mt-4 flex flex-col gap-2 rounded-2xl border border-border bg-muted/60 p-4 sm:flex-row sm:items-center sm:justify-between">
						<span className="text-[13px] text-foreground/75">
							Save it as a PDF to send on WhatsApp or email, or print it to take to the lender.
						</span>
						<PrintButton />
					</div>
				)}
			</div>
			{children}
			{printable && (
				<div className="mt-5 flex justify-center print:hidden">
					<PrintButton />
				</div>
			)}
		</div>
	);
}

function PrintButton() {
	return (
		<button
			type="button"
			onClick={() => window.print()}
			className="w-full shrink-0 cursor-pointer rounded-full border-none bg-foreground px-5 py-3 text-[14px] font-semibold text-background sm:w-auto"
		>
			Save as PDF / Print
		</button>
	);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
	return <h3 className="m-0 mb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-foreground/60 font-[family-name:var(--body-font)]">{children}</h3>;
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
	return (
		<section className="mt-8 break-inside-avoid">
			<div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
				<SectionTitle>{title}</SectionTitle>
				{note && <span className="text-[11px] text-foreground/50">{note}</span>}
			</div>
			{children}
		</section>
	);
}

function Field({ label, value, stacked = false }: { label: string; value: string; stacked?: boolean }) {
	return (
		<div className={stacked ? "" : "flex gap-1.5"}>
			<dt className="text-foreground/55">{label}{stacked ? "" : ":"}</dt>
			<dd className={`m-0 font-semibold ${stacked ? "mt-0.5" : ""}`}>{value}</dd>
		</div>
	);
}

function Headline({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "in" | "negative" }) {
	return (
		<div className="border-b border-r border-border p-4 [&:nth-child(2n)]:border-r-0 sm:border-b-0 sm:[&:nth-child(2n)]:border-r sm:last:border-r-0">
			<div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-foreground/55">{label}</div>
			<div className={`mt-1.5 font-display text-[21px] leading-tight tabular-nums sm:text-[23px] ${tone === "in" ? "text-positive" : tone === "negative" ? "text-destructive" : ""}`}>{value}</div>
			<div className="mt-1 text-[11px] text-foreground/55">{note}</div>
		</div>
	);
}

function Ranked({ title, items }: { title: string; items: { name: string; amount_pesewas: number; transactions: number; share_of_total: string | null }[] }) {
	return (
		<div className="break-inside-avoid">
			<SectionTitle>{title}</SectionTitle>
			{items.length === 0 ? (
				<p className="m-0 text-[12.5px] text-foreground/60">None recorded.</p>
			) : (
				<ul className="m-0 list-none p-0 text-[12.5px]">
					{items.map((item) => (
						<li key={item.name} className="flex justify-between gap-3 border-b border-foreground/8 py-2">
							<span className="min-w-0 truncate">{item.name}</span>
							<span className="shrink-0 tabular-nums">
								{formatGhs(item.amount_pesewas)}
								<span className="ml-1.5 text-foreground/50">{[item.share_of_total, `${item.transactions}×`].filter(Boolean).join(" · ")}</span>
							</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
