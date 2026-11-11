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
import { LenderSummarySkeleton } from "@/components/ui/Skeleton";

const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function formatDate(value: string | null | undefined): string {
	if (!value) return "—";
	return dateFormatter.format(new Date(value.length === 10 ? `${value}T00:00:00Z` : value));
}

/** Whole cedis: a summary for a lender reads better without pesewas. */
function cedis(pesewas: number): string {
	return formatGhs(Math.round(pesewas / 100) * 100);
}

/** "ST PETER SCHOOL CANTEEN" → "St Peter School Canteen", "•••417" → "Number ending 417". */
function tidyName(name: string): string {
	const masked = name.match(/^[•·*.x]+\s*(\d{2,})$/i);
	if (masked) return `Number ending ${masked[1]}`;
	if (name === name.toLowerCase()) return name.charAt(0).toUpperCase() + name.slice(1);
	if (name === name.toUpperCase()) {
		return name.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
	}
	return name;
}

/** Issuer codes such as OTHER_BANK are internal, so only real names are shown. */
function issuerName(issuer: string | null | undefined): string | null {
	if (!issuer || issuer.includes("_")) return null;
	return issuer;
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
		return <Page><LenderSummarySkeleton /></Page>;
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
	const net = totalIn - totalOut;
	const taxPaid = data.categories.money_out.find((row) => row.category === "tax");
	const taxStatus = taxStatusForLender(business?.tax_status?.value);
	const evidence = (documents.data?.items ?? []).filter((doc) => doc.status === "extracted");
	const fromProvider = evidence.filter((doc) => !doc.quality_flags?.hand_entered && isStatement(doc.doc_type)).length;
	const missing = (gaps.data ?? []).filter((gap) => gap.status === "open");
	const shortSpan = periods.length
		? `${shortMonth(periods[0].period)} ${periods[0].period.slice(0, 4)} – ${shortMonth(periods[periods.length - 1].period)} ${periods[periods.length - 1].period.slice(0, 4)}`
		: "—";
	const reference = businessId.replaceAll("-", "").slice(-8).toUpperCase();
	const identity = [
		sectorLabel(business?.sector_code),
		business?.region,
		business?.legal_name !== businessName ? business?.legal_name : null,
	].filter(Boolean) as string[];
	const tagged = data.farm?.groups ?? [];
	const unbroken = coverage.data ? coverage.data.continuous_months : null;
	const windowMonths = coverage.data?.analysis_window_months ?? periods.length;

	return (
		<Page printable>
			<article className="paper mx-auto overflow-hidden rounded-[22px] border border-border bg-card text-card-foreground shadow-card print:rounded-none print:border-0 print:shadow-none">
				{/* Cover */}
				<header className="relative overflow-hidden border-b border-border bg-[linear-gradient(135deg,var(--positive-background)_0%,transparent_62%)] px-6 pt-6 pb-7 sm:px-10 sm:pt-8 sm:pb-9 print:px-8">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="flex items-center gap-2.5">
							<Image src={iconDark} alt="" width={24} height={24} />
							<span className="font-display text-[15px]">OnRecord</span>
						</div>
						<div className="text-left text-[11.5px] leading-snug text-foreground/60 sm:text-right">
							<div className="font-semibold text-foreground/85">Financial record summary</div>
							<div className="tabular-nums">Prepared {formatDate(new Date().toISOString())} · Ref {reference}</div>
						</div>
					</div>

					<h2 className="m-0 mt-9 font-display text-[32px] leading-[1.05] sm:text-[44px]">{businessName}</h2>
					{identity.length > 0 && (
						<div className="mt-3 flex flex-wrap gap-1.5">
							{identity.map((item) => (
								<span key={item} className="rounded-full border border-border bg-card/70 px-3 py-1 text-[12px] text-foreground/75">{item}</span>
							))}
						</div>
					)}

					<div className="mt-7 grid gap-2.5 sm:grid-cols-3 print:grid-cols-3">
						<Proof ok label="Period covered" value={shortSpan} />
						<Proof ok={unbroken !== null && unbroken >= windowMonths} label="Statement months" value={unbroken !== null ? `${unbroken} of ${windowMonths} unbroken` : "—"} />
						<Proof ok={fromProvider > 0} label="Behind the numbers" value={`${fromProvider} statement${fromProvider === 1 ? "" : "s"} from the provider`} />
					</div>
				</header>

				<div className="px-6 py-7 sm:px-10 sm:py-9 print:px-8">
					{/* Key figures */}
					<section className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-[1.3fr_1fr_1fr] print:grid-cols-[1.3fr_1fr_1fr]">
						<div className="bg-card p-5 sm:p-6">
							<Label>Money in, average month</Label>
							<div className="mt-2 text-[34px] font-semibold leading-none tracking-tight tabular-nums text-positive sm:text-[40px]">{cedis(avgIn)}</div>
							<div className="mt-2.5 text-[12.5px] text-foreground/60">{cedis(totalIn)} over {activeMonths} month{activeMonths === 1 ? "" : "s"}</div>
						</div>
						<Figure label="Money out, average month" value={cedis(avgOut)} note={`${cedis(totalOut)} in total`} />
						<Figure
							label="Net cash flow"
							value={cedis(net)}
							note={`${positiveMonths} of ${periods.length} months ended above zero`}
							tone={net < 0 ? "negative" : undefined}
						/>
					</section>

					{/* Chart */}
					<Section title="Month by month" note="Transfers between the owner's own accounts are left out.">
						<MonthChart periods={periods} avgIn={avgIn} />
						<div className="mt-5 overflow-x-auto">
							<table className="w-full min-w-[480px] border-collapse text-[12.5px] tabular-nums">
								<thead>
									<tr className="text-left text-[11px] text-foreground/55">
										<th className="py-2 pr-3 font-medium">Month</th>
										<th className="py-2 pr-3 text-right font-medium">Money in</th>
										<th className="py-2 pr-3 text-right font-medium">Money out</th>
										<th className="py-2 pr-3 text-right font-medium">Net cash flow</th>
										<th className="py-2 text-right font-medium">Payments</th>
									</tr>
								</thead>
								<tbody>
									{periods.map((p, index) => (
										<tr key={p.period} className={index % 2 === 0 ? "bg-muted/60 print:bg-muted" : ""}>
											<td className="rounded-l-lg py-2 pr-3 pl-3">{monthLabel(p.period, true)}</td>
											<td className="py-2 pr-3 text-right">{cedis(p.money_in_pesewas)}</td>
											<td className="py-2 pr-3 text-right text-foreground/75">{cedis(p.money_out_pesewas)}</td>
											<td className={`py-2 pr-3 text-right font-medium ${p.net_pesewas < 0 ? "text-destructive" : "text-positive"}`}>{cedis(p.net_pesewas)}</td>
											<td className="rounded-r-lg py-2 pr-3 text-right text-foreground/60">{p.transactions}</td>
										</tr>
									))}
								</tbody>
								<tfoot>
									<tr className="font-semibold">
										<td className="border-t border-border pt-3 pr-3 pl-3">12-month total</td>
										<td className="border-t border-border pt-3 pr-3 text-right">{cedis(totalIn)}</td>
										<td className="border-t border-border pt-3 pr-3 text-right">{cedis(totalOut)}</td>
										<td className={`border-t border-border pt-3 pr-3 text-right ${net < 0 ? "text-destructive" : "text-positive"}`}>{cedis(net)}</td>
										<td className="border-t border-border pt-3 pr-3 text-right">{totalCount}</td>
									</tr>
								</tfoot>
							</table>
						</div>
					</Section>

					{/* Who pays, who is paid */}
					<section className="mt-10 grid gap-8 sm:grid-cols-2 print:grid-cols-2">
						<Ranked title="Main customers" tone="in" items={data.top_customers.counterparties.slice(0, 5)} />
						<Ranked title="Main suppliers" tone="out" items={data.top_suppliers.counterparties.slice(0, 5)} />
					</section>

					{tagged.length > 0 && (
						<Section title="By product or service" note="Money in minus money out for records the owner tagged. Not profit: unpaid bills and stock on hand are not included.">
							<div className="overflow-x-auto">
								<table className="w-full min-w-[520px] border-collapse text-[12.5px] tabular-nums">
									<thead>
										<tr className="text-left text-[11px] text-foreground/55">
											<th className="py-2 pr-3 font-medium">Product or service · season</th>
											<th className="py-2 pr-3 text-right font-medium">Money in</th>
											<th className="py-2 pr-3 text-right font-medium">Money out</th>
											<th className="py-2 pr-3 text-right font-medium">Left over</th>
											<th className="py-2 text-right font-medium">Typed in by owner</th>
										</tr>
									</thead>
									<tbody>
										{tagged.map((group, index) => (
											<tr key={`${group.farm_activity}|${group.season}`} className={index % 2 === 0 ? "bg-muted/60 print:bg-muted" : ""}>
												<td className="rounded-l-lg py-2 pr-3 pl-3">{[group.farm_activity ?? "No product given", group.season ?? "no season or batch"].join(" · ")}</td>
												<td className="py-2 pr-3 text-right">{cedis(group.money_in_pesewas)}</td>
												<td className="py-2 pr-3 text-right">{cedis(group.money_out_pesewas)}</td>
												<td className={`py-2 pr-3 text-right font-semibold ${group.left_over_pesewas < 0 ? "text-destructive" : ""}`}>{cedis(group.left_over_pesewas)}</td>
												<td className="rounded-r-lg py-2 pr-3 text-right text-foreground/70">{group.typed_in_by_owner} of {group.transactions}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</Section>
					)}

					{/* Identity and tax */}
					<Section title="Registration and tax">
						<dl className="m-0 grid gap-px overflow-hidden rounded-2xl border border-border bg-border text-[13px] sm:grid-cols-2 print:grid-cols-2">
							<Fact label="Business registration" value={business?.registration_number} />
							<Fact label="TIN or Ghana Card" value={business?.tin} />
							<Fact label="Tax status (owner's answer)" value={taxStatus} />
							<Fact
								label="Tax, SSNIT and assembly payments"
								value={taxPaid ? `${cedis(taxPaid.amount_pesewas)} · ${taxPaid.transactions} payment${taxPaid.transactions === 1 ? "" : "s"}` : null}
								empty="None found in these records"
							/>
						</dl>
					</Section>

					{/* Evidence and gaps */}
					<section className="mt-10 grid gap-8 sm:grid-cols-[1.4fr_1fr] print:grid-cols-[1.4fr_1fr]">
						<div className="break-inside-avoid">
							<SectionTitle>Records behind these numbers</SectionTitle>
							{evidence.length === 0 ? (
								<p className="m-0 text-[13px] text-foreground/60">No processed documents yet.</p>
							) : (
								<ul className="m-0 grid list-none gap-2 p-0 text-[13px]">
									{evidence.map((doc) => {
										const typed = Boolean(doc.quality_flags?.hand_entered);
										const provider = !typed && isStatement(doc.doc_type);
										const issuer = issuerName(doc.issuer);
										return (
											<li key={doc.id} className="flex items-center gap-3 rounded-xl border border-border px-3.5 py-3">
												<DocIcon provider={provider} />
												<span className="min-w-0 flex-1">
													<span className="block truncate font-medium">
														{typed ? `Records typed in by the owner (${doc.transaction_count ?? 0})` : `${docTypeLabel(doc.doc_type)}${issuer ? ` · ${issuer}` : ""}`}
													</span>
													<span className="block text-[11.5px] text-foreground/55 tabular-nums">
														{doc.period_start ? `${formatDate(doc.period_start)} – ${formatDate(doc.period_end)}` : formatDate(doc.created_at)}
													</span>
												</span>
												<span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${provider ? "bg-positive-background text-positive" : "bg-muted text-foreground/65"}`}>
													{evidenceKind(doc.doc_type, typed)}
												</span>
											</li>
										);
									})}
								</ul>
							)}
						</div>
						<div className="break-inside-avoid">
							<SectionTitle>Still being gathered</SectionTitle>
							{missing.length === 0 ? (
								<p className="m-0 rounded-xl bg-positive-background px-4 py-3 text-[13px] text-positive">Nothing outstanding.</p>
							) : (
								<ul className="m-0 grid list-none gap-2 p-0 text-[13px]">
									{missing.slice(0, 8).map((gap) => (
										<li key={gap.id} className="flex items-start gap-2.5 rounded-xl bg-warning-background px-3.5 py-3 text-foreground/85 print:bg-muted">
											<span className="mt-[6px] h-2 w-2 shrink-0 rounded-full bg-warning" aria-hidden="true" />
											{gapTitle(gap)}
										</li>
									))}
								</ul>
							)}
						</div>
					</section>

					<footer className="mt-10 rounded-2xl bg-muted/70 px-5 py-4 text-[11px] leading-relaxed text-foreground/60 print:bg-muted">
						<p className="m-0">
							Prepared with OnRecord from bank and MoMo statements and other records the owner uploaded and confirmed. Records the owner typed
							in themselves, such as cash sales, are counted and marked as typed in. Transfers between the owner&apos;s own accounts are left
							out. Tax payments are those the records show and are not a tax clearance. This is a summary of records, not an audited
							statement or a credit decision.
						</p>
						<p className="m-0 mt-2.5 flex justify-between gap-4 text-foreground/45">
							<span className="tabular-nums">Ref {reference}</span>
							<span>OnRecord · financial records for small businesses in Ghana</span>
						</p>
					</footer>
				</div>
			</article>
		</Page>
	);
}

function isStatement(docType: string | null | undefined): boolean {
	return docType === "bank_statement" || docType === "momo_statement" || docType === "momo_merchant_statement" || docType === "processor_statement";
}

function evidenceKind(docType: string | null | undefined, typed: boolean): string {
	if (typed) return "Owner's own record";
	if (isStatement(docType)) return "From the provider";
	if (docType === "receipt" || docType === "invoice_issued" || docType === "invoice_received") return "Supporting document";
	return "Owner's own record";
}

function Page({ children, printable = false }: { children: React.ReactNode; printable?: boolean }) {
	return (
		<div className="flex-1 min-w-0 px-4 sm:px-7 pt-6 sm:pt-7.5 pb-10 max-w-[960px] print:max-w-none print:p-0">
			<div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between print:hidden">
				<div>
					<h1 className="text-[24px] sm:text-[28px] m-0 mb-1.5">Lender summary</h1>
					<p className="text-sm text-foreground/65 m-0 max-w-[520px]">
						Your last 12 months on one page. Save it as a PDF to send on WhatsApp or email, or print it for the lender.
					</p>
				</div>
				{printable && <PrintButton />}
			</div>
			{children}
			{printable && (
				<div className="mt-6 flex justify-center print:hidden">
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
			className="inline-flex w-full shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full border-none bg-foreground px-5 py-3 text-[14px] font-semibold text-background sm:w-auto"
		>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
				<path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />
			</svg>
			Save as PDF / Print
		</button>
	);
}

function Label({ children }: { children: React.ReactNode }) {
	return <div className="text-[12px] font-medium text-foreground/60">{children}</div>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
	return <h3 className="m-0 mb-3 text-[15px] font-semibold tracking-tight font-[family-name:var(--body-font)]">{children}</h3>;
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
	return (
		<section className="mt-10 break-inside-avoid">
			<div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<SectionTitle>{title}</SectionTitle>
				{note && <span className="mb-3 text-[11.5px] text-foreground/50">{note}</span>}
			</div>
			{children}
		</section>
	);
}

function Proof({ ok, label, value }: { ok: boolean; label: string; value: string }) {
	return (
		<div className="flex items-center gap-3 rounded-xl border border-border bg-card/80 px-3.5 py-3 print:bg-card">
			<span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${ok ? "bg-positive text-background" : "bg-muted text-foreground/50"}`} aria-hidden="true">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
					{ok ? <path d="m5 12.5 4.5 4.5L19 7.5" /> : <path d="M6 12h12" />}
				</svg>
			</span>
			<span className="min-w-0">
				<span className="block text-[11.5px] text-foreground/55">{label}</span>
				<span className="block truncate text-[13.5px] font-semibold">{value}</span>
			</span>
		</div>
	);
}

function Figure({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "negative" }) {
	return (
		<div className="bg-card p-5 sm:p-6">
			<Label>{label}</Label>
			<div className={`mt-2 text-[26px] font-semibold leading-none tracking-tight tabular-nums sm:text-[28px] ${tone === "negative" ? "text-destructive" : ""}`}>{value}</div>
			<div className="mt-2.5 text-[12.5px] text-foreground/60">{note}</div>
		</div>
	);
}

function Fact({ label, value, empty = "Not given" }: { label: string; value: string | null | undefined; empty?: string }) {
	return (
		<div className="bg-card px-4 py-3.5">
			<dt className="text-[11.5px] text-foreground/55">{label}</dt>
			<dd className={`m-0 mt-0.5 font-semibold ${value ? "" : "font-normal text-foreground/50"}`}>{value || empty}</dd>
		</div>
	);
}

type Period = { period: string; money_in_pesewas: number; money_out_pesewas: number; net_pesewas: number; transactions: number };

/** Paired bars per month (in and out) with a dashed line at the average money in. Plain HTML so it prints. */
function MonthChart({ periods, avgIn }: { periods: Period[]; avgIn: number }) {
	const peak = Math.max(1, ...periods.flatMap((p) => [p.money_in_pesewas, p.money_out_pesewas]));
	const avgPct = (avgIn / peak) * 100;
	return (
		<div className="rounded-2xl border border-border p-4 sm:p-5">
			<div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-foreground/65">
				<span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-positive" />Money in</span>
				<span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-foreground/25" />Money out</span>
				<span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-positive/70" />Average money in</span>
			</div>
			<div className="relative h-[170px] sm:h-[200px]">
				<div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-positive/50" style={{ bottom: `${avgPct}%` }} aria-hidden="true" />
				<div className="flex h-full items-end gap-1 sm:gap-2" role="img" aria-label="Money in and out for each month">
					{periods.map((p) => (
						<div key={p.period} className="flex h-full flex-1 items-end justify-center gap-[2px] sm:gap-1">
							<span className="w-full max-w-[18px] rounded-t-[4px] bg-positive" style={{ height: `${Math.max(1, (p.money_in_pesewas / peak) * 100)}%` }} />
							<span className="w-full max-w-[18px] rounded-t-[4px] bg-foreground/25" style={{ height: `${Math.max(1, (p.money_out_pesewas / peak) * 100)}%` }} />
						</div>
					))}
				</div>
			</div>
			<div className="mt-2 flex gap-1 border-t border-border pt-2 sm:gap-2">
				{periods.map((p) => (
					<span key={p.period} className="flex-1 text-center text-[10.5px] text-foreground/55">{shortMonth(p.period)}</span>
				))}
			</div>
		</div>
	);
}

function shortMonth(period: string): string {
	const month = Number(period.slice(5, 7));
	return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1] ?? period;
}

function DocIcon({ provider }: { provider: boolean }) {
	return (
		<span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${provider ? "bg-positive-background text-positive" : "bg-muted text-foreground/60"}`} aria-hidden="true">
			<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
				<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
				<path d="M14 3v5h5M9 13h6M9 17h4" />
			</svg>
		</span>
	);
}

function Ranked({ title, items, tone }: { title: string; tone: "in" | "out"; items: { name: string; amount_pesewas: number; transactions: number; share_of_total: string | null }[] }) {
	const peak = Math.max(1, ...items.map((item) => item.amount_pesewas));
	return (
		<div className="break-inside-avoid">
			<SectionTitle>{title}</SectionTitle>
			{items.length === 0 ? (
				<p className="m-0 text-[13px] text-foreground/60">None recorded.</p>
			) : (
				<ul className="m-0 grid list-none gap-3.5 p-0 text-[13px]">
					{items.map((item) => (
						<li key={item.name}>
							<div className="flex items-baseline justify-between gap-3">
								<span className="min-w-0 truncate font-medium">{tidyName(item.name)}</span>
								<span className="shrink-0 font-semibold tabular-nums">{cedis(item.amount_pesewas)}</span>
							</div>
							<div className="mt-1.5 flex items-center gap-2.5">
								<span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted print:bg-foreground/10" aria-hidden="true">
									<span className={`block h-full rounded-full ${tone === "in" ? "bg-positive" : "bg-foreground/40"}`} style={{ width: `${(item.amount_pesewas / peak) * 100}%` }} />
								</span>
								<span className="shrink-0 whitespace-nowrap text-right text-[11.5px] text-foreground/55 tabular-nums">
									{[item.share_of_total, `${item.transactions} payment${item.transactions === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
								</span>
							</div>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
