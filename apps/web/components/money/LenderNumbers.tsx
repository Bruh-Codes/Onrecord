"use client";

import Link from "next/link";
import { InvoiceInsightsPanel } from "@/components/overview/InvoiceInsightsPanel";
import { MetricStat } from "@/components/overview/MetricStat";
import { seriesTotal } from "@/lib/format";
import { useIndicatorsMap, useInvoiceInsights } from "@/lib/hooks/use-business";
import { Skeleton } from "@/components/ui/Skeleton";

type Series = { m: string; v: number }[];
type Indicator = { value_json: Record<string, unknown> } | undefined;

function valueOf(indicator: Indicator): number | null {
	if (indicator?.value_json?.status === "insufficient_data") return null;
	const value = indicator?.value_json?.v;
	return typeof value === "number" ? value : null;
}

function seriesOf(indicator: Indicator): Series {
	const series = indicator?.value_json?.series;
	return Array.isArray(series) ? (series as Series) : [];
}

/**
 * The ratios a lender works out from the owner's records (sales growth, costs
 * as a share of sales, days the account ran empty...). These come from the
 * readiness analysis, which covers the last 12 months of statements, so a
 * shorter range on the Money page only trims the monthly series.
 */
export function LenderNumbers({ businessId, months }: { businessId: string; months: number }) {
	const indicators = useIndicatorsMap(businessId);
	const invoices = useInvoiceInsights(businessId);
	if (indicators.isError) return null;
	if (indicators.isLoading) {
		return (
			<section aria-busy="true" aria-label="Loading what a lender works out" className="mt-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
				<Skeleton className="h-4 w-44" />
				<Skeleton className="mt-2 mb-4 h-2.5 w-3/4" />
				<div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
					{[0, 1, 2, 3, 4, 5].map((i) => (
						<div key={i} className="rounded-xl bg-muted/50 p-3.5">
							<Skeleton className="h-3 w-24" />
							<Skeleton className="mt-2 h-6 w-20" />
							<Skeleton className="mt-2 h-2.5 w-28 max-w-full" />
						</div>
					))}
				</div>
			</section>
		);
	}

	const map = indicators.map;
	const avgTicket = seriesOf(map.AVG_TICKET).slice(-months);
	const tradingDays = seriesOf(map.ACTIVE_TRADING_DAYS).slice(-months);
	const cashLeft = seriesOf(map.OPERATING_CASHFLOW).slice(-months);
	const costRatio = valueOf(map.OPEX_RATIO);
	const periodText = `last ${months} months`;
	const unsorted = valueOf(map.UNCLASSIFIED_RATIO) ?? 0;

	return (
		<section className="mt-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
			<h2 className="m-0 text-[15px] font-semibold font-[family-name:var(--body-font)]">What a lender works out</h2>
			<p className="m-0 mt-1 mb-3 text-[12px] text-foreground/50">
				The numbers a bank or microfinance officer looks at: how steady your sales are, how much goes on costs, and whether your account runs empty.
			</p>
			<div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
				<MetricStat label="Sales growth" value={valueOf(map.REV_GROWTH_3M)} unit="ratio" detail="Last 3 months vs the 3 before" />
				<MetricStat label="Average sale" value={avgTicket.length ? Math.round(seriesTotal(avgTicket) / avgTicket.length) : null} detail="Typical payment you receive" />
				<MetricStat label="Days with sales" value={tradingDays.length ? seriesTotal(tradingDays) : null} unit="count" detail={periodText} />
				<MetricStat label="Costs as a share of sales" value={costRatio} unit="ratio" detail={costRatio == null ? "Needs sales to work out" : `GH¢${costRatio.toFixed(2)} of every GH¢1 you sell`} />
				<MetricStat label="Cash left after running costs" value={cashLeft.length ? seriesTotal(cashLeft) : null} detail={periodText} />
				<MetricStat label="Days the account was empty" value={valueOf(map.NEGATIVE_BALANCE_DAYS)} unit="count" detail="Lenders like this close to zero" />
			</div>
			{unsorted > 0 && (
				<p className="m-0 mt-3 text-[12.5px] text-foreground/60">
					{Math.round(unsorted * 100)}% of your money isn&apos;t sorted into sales or costs yet, so these numbers may be off.{" "}
					<Link href="/reviewer" className="font-semibold underline underline-offset-2">Sort it now</Link>
				</p>
			)}
			{(invoices.data?.total_documents ?? 0) > 0 && (
				<div className="mt-5">
					<h3 className="m-0 mb-3 text-[14px] font-semibold font-[family-name:var(--body-font)]">Invoices and bills</h3>
					<InvoiceInsightsPanel data={invoices.data} />
				</div>
			)}
		</section>
	);
}
