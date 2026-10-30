"use client";

import Link from "next/link";
import { useState } from "react";
import { InvoiceInsightsPanel } from "@/components/overview/InvoiceInsightsPanel";
import { MetricStat } from "@/components/overview/MetricStat";
import { TransactionValueBreakdown } from "@/components/overview/TransactionValueBreakdown";
import { TrendChart } from "@/components/overview/TrendChart";
import { OverviewPageSkeleton } from "@/components/ui/Skeleton";
import {
	useCoverage,
	useGaps,
	useIndicatorsMap,
	useInvoiceInsights,
	useMe,
} from "@/lib/hooks/use-business";
import { formatGhs, seriesToPoints, seriesTotal } from "@/lib/format";

const PERIODS = [
	{ value: 3, label: "3 months" },
	{ value: 6, label: "6 months" },
	{ value: 12, label: "12 months" },
];

type Series = { m: string; v: number }[];

function indicatorValue(indicator: { value_json: Record<string, unknown> } | undefined): number | null {
	const value = indicator?.value_json?.v;
	return typeof value === "number" ? value : null;
}

function seriesOf(indicator: { value_json: Record<string, unknown> } | undefined): Series {
	const series = indicator?.value_json?.series;
	return Array.isArray(series) ? (series as Series) : [];
}

/** Ratio indicators report "insufficient_data" when there is nothing to divide by. */
function ratioOf(indicator: { value_json: Record<string, unknown> } | undefined): number | null {
	if (indicator?.value_json?.status === "insufficient_data") return null;
	return indicatorValue(indicator);
}

/**
 * The numbers a lender works out from the owner's records, on one page:
 * sales, costs and cash, for the last 3, 6 or 12 months. Gaps in the loan file
 * live on Loan readiness; this page only links there.
 */
export default function OverviewPage() {
	const [months, setMonths] = useState(12);
	const { businessId } = useMe();
	const coverage = useCoverage(businessId);
	const indicators = useIndicatorsMap(businessId);
	const gaps = useGaps(businessId);
	const invoiceInsights = useInvoiceInsights(businessId);

	if (!businessId || coverage.isLoading || indicators.isLoading || gaps.isLoading || invoiceInsights.isLoading) {
		return <OverviewPageSkeleton />;
	}

	const map = indicators.map;
	const sales = seriesOf(map.REV_MONTHLY).slice(-months);
	const cashLeft = seriesOf(map.OPERATING_CASHFLOW).slice(-months);
	const net = seriesOf(map.NET_CASHFLOW).slice(-months);
	const moved = seriesOf(map.TRANSACTION_VALUE).slice(-months);
	const avgTicket = seriesOf(map.AVG_TICKET).slice(-months);
	const tradingDays = seriesOf(map.ACTIVE_TRADING_DAYS).slice(-months);
	const breakdown = map.TRANSACTION_VALUE?.value_json?.breakdown as
		| { key: string; label: string; value: number; series?: Series }[]
		| undefined;
	const costRatio = ratioOf(map.OPEX_RATIO);
	const unsortedRatio = ratioOf(map.UNCLASSIFIED_RATIO);

	const salesTotal = seriesTotal(sales);
	const movedTotal = moved.length ? seriesTotal(moved) : (indicatorValue(map.TRANSACTION_VALUE) ?? salesTotal);
	const averageSale = avgTicket.length ? Math.round(seriesTotal(avgTicket) / avgTicket.length) : null;
	const daysWithSales = tradingDays.length ? seriesTotal(tradingDays) : null;
	const openGaps = (gaps.data ?? []).filter((gap) => gap.status === "open").length;
	const hasAnything = movedTotal > 0 || salesTotal > 0;
	const periodText = `last ${months} months`;

	return (
		<div className="flex-1 min-w-0 px-4 sm:px-7 pt-6 sm:pt-7.5 pb-10 max-w-[1100px]">
			<div className="mb-6 flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="text-[24px] sm:text-[28px] m-0 mb-1.5">Business health</h1>
					<p className="text-sm opacity-70 m-0 max-w-[620px]">
						The numbers a lender works out from your records: how steady your sales are, how much goes
						on costs, and whether your account runs empty.
					</p>
				</div>
				<div className="flex rounded-full border border-border p-0.5" role="group" aria-label="Time range">
					{PERIODS.map((option) => (
						<button
							key={option.value}
							type="button"
							aria-pressed={months === option.value}
							onClick={() => setMonths(option.value)}
							className={`rounded-full px-3 py-1.5 text-[12.5px] cursor-pointer ${months === option.value ? "bg-foreground text-background" : "text-foreground/70"}`}
						>
							{option.label}
						</button>
					))}
				</div>
			</div>

			{!hasAnything && (
				<div className="mb-6 rounded-2xl border border-dashed border-foreground/25 bg-muted/50 p-6 text-center text-[13px] text-foreground/65">
					These numbers fill in once your first statement or records are read.{" "}
					<Link href="/documents" className="font-semibold underline underline-offset-2">Add records</Link>
				</div>
			)}

			<h2 className="m-0 mb-3 text-[15px] font-semibold font-[family-name:var(--body-font)]">Sales</h2>
			<div className="grid gap-3 mb-4 grid-cols-2 lg:grid-cols-4">
				<MetricStat label="Sales" value={salesTotal} detail={periodText} />
				<MetricStat label="Sales growth" value={indicatorValue(map.REV_GROWTH_3M)} unit="ratio" detail="Last 3 months vs the 3 before" />
				<MetricStat label="Average sale" value={averageSale} detail="Typical payment you receive" />
				<MetricStat label="Days with sales" value={daysWithSales} unit="count" detail={periodText} />
			</div>
			<div className="grid gap-4 mb-8 md:grid-cols-2">
				<div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
					<TrendChart
						title="Sales by month"
						totalLabel={formatGhs(salesTotal)}
						series={seriesToPoints(sales)}
						color="var(--foreground)"
						idleCaption="No sales recorded in this period"
					/>
				</div>
				<div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
					<TrendChart
						title="Cash left after running costs, by month"
						totalLabel={formatGhs(seriesTotal(cashLeft))}
						series={seriesToPoints(cashLeft)}
						color="var(--muted-foreground)"
						idleCaption="Nothing to show for this period yet"
					/>
				</div>
			</div>

			<h2 className="m-0 mb-3 text-[15px] font-semibold font-[family-name:var(--body-font)]">Costs and cash</h2>
			<div className="grid gap-3 mb-8 grid-cols-2 lg:grid-cols-4">
				<MetricStat label="Costs as a share of sales" value={costRatio} unit="ratio" detail={costRatio == null ? "Needs sales to work out" : `GH¢${costRatio.toFixed(2)} of every GH¢1 you sell`} />
				<MetricStat label="Cash left after running costs" value={seriesTotal(cashLeft)} detail={periodText} />
				<MetricStat label="Money in minus money out" value={seriesTotal(net)} detail={periodText} />
				<MetricStat label="Days the account was empty" value={indicatorValue(map.NEGATIVE_BALANCE_DAYS)} unit="count" detail="Lenders like this close to zero" />
			</div>

			<section className="mb-8 rounded-2xl border border-border bg-card p-4 sm:p-5 max-w-[560px]">
				<TransactionValueBreakdown
					revenueTotal={salesTotal}
					transactionTotal={movedTotal}
					opexRatio={costRatio}
					unclassifiedRatio={unsortedRatio}
					breakdown={breakdown}
					months={months}
				/>
				{(unsortedRatio ?? 0) > 0 && (
					<Link href="/reviewer" className="mt-4 inline-flex items-center gap-2 text-[13px] font-semibold underline underline-offset-4">
						Sort the money we couldn&apos;t place <span aria-hidden="true">→</span>
					</Link>
				)}
			</section>

			{(invoiceInsights.data?.total_documents ?? 0) > 0 && (
				<>
					<h2 className="m-0 mb-3 text-[15px] font-semibold font-[family-name:var(--body-font)]">Invoices and bills</h2>
					<InvoiceInsightsPanel data={invoiceInsights.data} />
				</>
			)}

			<div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-muted/60 px-4 py-3 text-[13px]">
				<span>
					Statement history: <strong>{coverage.data?.continuous_months ?? 0} of {coverage.data?.analysis_window_months ?? 12} months</strong>
					{openGaps > 0 ? ` · ${openGaps} thing${openGaps === 1 ? "" : "s"} still missing from your loan file` : " · nothing missing from your loan file"}
				</span>
				<Link href="/readiness" className="font-semibold underline underline-offset-2">See loan readiness</Link>
			</div>
		</div>
	);
}
