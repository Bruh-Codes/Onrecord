"use client";

import { GapsAndCoverage } from "@/components/overview/GapsAndCoverage";
import { TransactionValueBreakdown } from "@/components/overview/TransactionValueBreakdown";
import { TrendChart } from "@/components/overview/TrendChart";
import {
	useCoverage,
	useGaps,
	useIndicatorsMap,
	useMe,
	useInvoiceInsights,
} from "@/lib/hooks/use-business";
import { formatGhs, seriesToPoints, seriesTotal } from "@/lib/format";
import { OverviewPageSkeleton } from "@/components/ui/Skeleton";
import { MetricStat } from "@/components/overview/MetricStat";
import { Dropdown } from "@/components/ui/Dropdown";
import { InvoiceInsightsPanel } from "@/components/overview/InvoiceInsightsPanel";
import { useState } from "react";
import Link from "next/link";

type OverviewMode =
	| "executive"
	| "transactions"
	| "revenue"
	| "profitability"
	| "cashflow"
	| "coverage";

type SourceScope = "statements" | "invoices" | "other";

const MODES: { value: OverviewMode; label: string }[] = [
	{ value: "executive", label: "Summary" },
	{ value: "transactions", label: "Sales activity" },
	{ value: "revenue", label: "Sales" },
	{ value: "profitability", label: "Costs" },
	{ value: "cashflow", label: "Cash flow" },
	{ value: "coverage", label: "Record gaps" },
];

const PERIODS = [
	{ value: 3, label: "Last 3 months" },
	{ value: 6, label: "Last 6 months" },
	{ value: 12, label: "Trailing 12 months" },
];

const SOURCE_SCOPES: { value: SourceScope; label: string }[] = [
	{ value: "statements", label: "Bank & MoMo statements" },
	{ value: "invoices", label: "Invoices" },
	{ value: "other", label: "Other documents" },
];

function indicatorValue(
	indicator: { value_json: Record<string, unknown> } | undefined,
): number | null {
	const value = indicator?.value_json?.v;
	return typeof value === "number" ? value : null;
}

export default function OverviewPage() {
	const [mode, setMode] = useState<OverviewMode>("executive");
	const [sourceScope, setSourceScope] = useState<SourceScope>("statements");
	const [periodMonths, setPeriodMonths] = useState(12);
	const { businessId } = useMe();
	const coverage = useCoverage(businessId);
	const indicators = useIndicatorsMap(businessId);
	const gaps = useGaps(businessId);
	const invoiceInsights = useInvoiceInsights(businessId);

	if (
		!businessId ||
		coverage.isLoading ||
		indicators.isLoading ||
		gaps.isLoading ||
		invoiceInsights.isLoading
	) {
		return <OverviewPageSkeleton />;
	}

	const rev = indicators.map.REV_MONTHLY?.value_json as
		| { series?: { m: string; v: number }[] }
		| undefined;
	const cf = indicators.map.OPERATING_CASHFLOW?.value_json as
		| { series?: { m: string; v: number }[] }
		| undefined;
	const opexRatio = indicators.map.OPEX_RATIO?.value_json as
		| { v?: number; status?: string }
		| undefined;
	const unclassified = indicators.map.UNCLASSIFIED_RATIO?.value_json as
		| { v?: number; status?: string }
		| undefined;
	const transactionValue = indicators.map.TRANSACTION_VALUE?.value_json as
		| { v?: number }
		| undefined;
	const transactionBreakdown = indicators.map.TRANSACTION_VALUE?.value_json
		?.breakdown as
		| {
				key: string;
				label: string;
				value: number;
				series?: { m: string; v: number }[];
		  }[]
		| undefined;
	const transactionSeries = (indicators.map.TRANSACTION_VALUE?.value_json
		?.series ?? []) as { m: string; v: number }[];
	const avgTicketSeries = (indicators.map.AVG_TICKET?.value_json?.series ??
		[]) as { m: string; v: number }[];
	const activeTradingDaysSeries = (indicators.map.ACTIVE_TRADING_DAYS
		?.value_json?.series ?? []) as { m: string; v: number }[];
	const revenueGrowth = indicatorValue(indicators.map.REV_GROWTH_3M);
	const netCashflow = (indicators.map.NET_CASHFLOW?.value_json?.series ??
		[]) as { m: string; v: number }[];
	const negativeBalanceDays = indicatorValue(
		indicators.map.NEGATIVE_BALANCE_DAYS,
	);

	const revenueSeries = Array.isArray(rev?.series) ? rev.series : [];
	const cashflowSeries = Array.isArray(cf?.series) ? cf.series : [];
	const selectedRevenueSeries = revenueSeries.slice(-periodMonths);
	const selectedCashflowSeries = cashflowSeries.slice(-periodMonths);
	const selectedTransactionSeries = transactionSeries.slice(-periodMonths);
	const selectedNetCashflow = netCashflow.slice(-periodMonths);
	const selectedAvgTicket = avgTicketSeries.slice(-periodMonths);
	const selectedActiveTradingDays =
		activeTradingDaysSeries.slice(-periodMonths);
	const avgTicket =
		selectedAvgTicket.length > 0
			? Math.round(seriesTotal(selectedAvgTicket) / selectedAvgTicket.length)
			: null;
	const activeTradingDays =
		selectedActiveTradingDays.length > 0
			? seriesTotal(selectedActiveTradingDays)
			: null;
	const revenueTotal = seriesTotal(selectedRevenueSeries);
	const transactionTotal =
		transactionSeries.length > 0
			? seriesTotal(selectedTransactionSeries)
			: (transactionValue?.v ?? revenueTotal);
	const modeLabel =
		MODES.find((item) => item.value === mode)?.label ?? "Overview";
	const periodLabel =
		PERIODS.find((period) => period.value === periodMonths)?.label ??
		"Selected period";
	const coverageAvailable =
		(coverage.data?.continuous_months ?? 0) > 0 ||
		(gaps.data ?? []).some((gap) => gap.status === "open");
	const modeOptions = MODES.filter(
		(item) => !(item.value === "coverage" && !coverageAvailable),
	);
	const selectedRevenuePoints = seriesToPoints(selectedRevenueSeries);
	const selectedCashflowPoints = seriesToPoints(selectedCashflowSeries);
	const showCash = sourceScope === "statements";
	const showInvoices = sourceScope === "invoices";
	const hasUnclassified =
		unclassified?.status !== "insufficient_data" && (unclassified?.v ?? 0) > 0;

	const viewSelect = (
		<label className="flex items-center gap-2 text-[13px] text-foreground/65">
			<span>View</span>
			<Dropdown
				value={mode}
				options={modeOptions}
				onChange={(value) => setMode(value)}
			/>
		</label>
	);
	const periodSelect = (
		<label className="flex items-center gap-2 text-[13px] text-foreground/65">
			<span>Period</span>
			<Dropdown
				value={periodMonths}
				options={PERIODS}
				onChange={(value) => setPeriodMonths(value)}
			/>
		</label>
	);
	const sourceSelect = (
		<label className="flex items-center gap-2 text-[13px] text-foreground/65">
			<span>Source</span>
			<Dropdown
				value={sourceScope}
				options={SOURCE_SCOPES}
				onChange={(value) => {
					setSourceScope(value);
					if (value === "invoices" || value === "other") setMode("executive");
				}}
			/>
		</label>
	);

	return (
		<div className="flex-1 min-w-0 px-4 sm:px-7 pt-6 sm:pt-7.5 pb-10">
			<div className="flex flex-wrap items-start justify-between gap-5 mb-10">
				<div>
					<h1 className="text-[24px] sm:text-[28px] m-0 mb-2">
						Business health
					</h1>
					<p className="text-sm opacity-65 m-0 max-w-[620px]">
						The numbers a lender works out from your records: how steady your
						sales are, what share goes to costs, and whether your account runs
						dry. Updated whenever new records come in.
					</p>
				</div>
				{sourceSelect}
			</div>

			{sourceScope === "other" && (
				<div className="rounded-xl border border-border/70 p-5 mb-10 text-sm text-foreground/65">
					Other documents contribute supporting evidence and readiness coverage.
					They do not represent cashflow or invoice totals.
				</div>
			)}

			{showCash && (
				<div className="text-xs tracking-wider uppercase text-foreground/45 mb-4.5">
					{mode === "executive"
						? "Sales & cash at a glance"
						: `${modeLabel} insights`}
				</div>
			)}
			{showCash && mode === "executive" && (
				<div className="grid gap-[52px] mb-12 grid-cols-1 lg:grid-cols-[1fr_1.3fr_1.3fr]">
					<div>
						<div className="mb-4">{viewSelect}</div>
						<TransactionValueBreakdown
							revenueTotal={revenueTotal}
							transactionTotal={transactionTotal}
							opexRatio={
								opexRatio?.status === "insufficient_data"
									? null
									: (opexRatio?.v ?? null)
							}
							unclassifiedRatio={
								unclassified?.status === "insufficient_data"
									? null
									: (unclassified?.v ?? null)
							}
							breakdown={transactionBreakdown}
							months={periodMonths}
						/>
						{hasUnclassified && (
							<Link
								href="/reviewer"
								className="mt-4 inline-flex items-center gap-2 text-[13px] font-semibold text-foreground underline decoration-ink/30 underline-offset-4 hover:decoration-ink"
							>
								Sort uncategorised transactions{" "}
								<span aria-hidden="true">→</span>
							</Link>
						)}
					</div>
					<div>
						<div className="mb-4">{periodSelect}</div>
						<TrendChart
							title={`Sales, ${periodLabel.toLowerCase()}`}
							totalLabel={formatGhs(revenueTotal)}
							series={selectedRevenuePoints}
							color="var(--foreground)"
							idleCaption="No sales recorded in this period"
						/>
					</div>
					<TrendChart
						title={`Cash left from operations, ${periodLabel.toLowerCase()}`}
						totalLabel={formatGhs(seriesTotal(selectedCashflowSeries))}
						series={selectedCashflowPoints}
						color="var(--muted-foreground)"
						idleCaption={`Coverage: ${coverage.data?.continuous_months ?? 0}/${coverage.data?.analysis_window_months ?? 12} months`}
					/>
				</div>
			)}

			{showCash && mode !== "executive" && (
				<div className="flex flex-wrap items-center gap-24 mb-5">
					{viewSelect}
					{periodSelect}
				</div>
			)}

			{showCash && mode === "transactions" && (
				<div className="grid gap-5 mb-12 grid-cols-1 md:grid-cols-3">
					<MetricStat
						label="Total money moved"
						value={transactionTotal}
						detail={periodLabel}
					/>
					<MetricStat
						label="Average sale"
						value={avgTicket}
						detail="Typical payment you receive"
					/>
					<MetricStat
						label="Days with sales"
						value={activeTradingDays}
						unit="count"
						detail={periodLabel}
					/>
					<div className="md:col-span-3">
						<TransactionValueBreakdown
							revenueTotal={revenueTotal}
							transactionTotal={transactionTotal}
							opexRatio={null}
							unclassifiedRatio={null}
							breakdown={transactionBreakdown}
							months={periodMonths}
						/>
					</div>
				</div>
			)}

			{showCash && mode === "revenue" && (
				<div className="grid gap-5 mb-12 grid-cols-1 md:grid-cols-3">
					<MetricStat
						label="Sales"
						value={revenueTotal}
						detail={periodLabel}
					/>
					<MetricStat
						label="Sales growth"
						value={revenueGrowth}
						unit="ratio"
						detail="Last 3 months compared with the 3 before"
					/>
					<MetricStat
						label="Average sale"
						value={avgTicket}
						detail="Typical payment you receive"
					/>
				</div>
			)}

			{showCash && mode === "profitability" && (
				<div className="grid gap-5 mb-12 grid-cols-1 md:grid-cols-3">
					<MetricStat
						label="Sales"
						value={revenueTotal}
						detail={periodLabel}
					/>
					<MetricStat
						label="Costs as share of sales"
						value={
							opexRatio?.status === "insufficient_data"
								? null
								: (opexRatio?.v ?? null)
						}
						unit="ratio"
						detail="Running costs for every GH¢1 of sales"
					/>
					<MetricStat
						label="Not yet categorised"
						value={
							unclassified?.status === "insufficient_data"
								? null
								: transactionTotal * (unclassified?.v ?? 0)
						}
						detail="Sort these so lenders see true costs"
					/>
				</div>
			)}

			{showCash && mode === "cashflow" && (
				<div className="grid gap-5 mb-12 grid-cols-1 md:grid-cols-3">
					<MetricStat
						label="Cash left from operations"
						value={seriesTotal(selectedCashflowSeries)}
						detail={periodLabel}
					/>
					<MetricStat
						label="Money in minus money out"
						value={seriesTotal(selectedNetCashflow)}
						detail={periodLabel}
					/>
					<MetricStat
						label="Days the account was empty or overdrawn"
						value={negativeBalanceDays}
						unit="count"
						detail="Lenders prefer this close to zero"
					/>
				</div>
			)}

			{showCash && mode === "coverage" && (
				<div className="mb-12">
					<GapsAndCoverage
						gaps={(gaps.data ?? []).filter((g) => g.status === "open")}
						coverage={coverage.data}
						allGapCount={
							(gaps.data ?? []).filter((g) => g.status === "open").length
						}
						unclassifiedRatio={
							unclassified?.status === "insufficient_data"
								? null
								: (unclassified?.v ?? null)
						}
					/>
				</div>
			)}

			{showCash && mode !== "coverage" && (
				<>
					<div className="h-px bg-border mb-10" />
					<div className="text-xs tracking-wider uppercase text-foreground/45 mb-4.5">
						Gaps in your records
					</div>
					<GapsAndCoverage
						gaps={(gaps.data ?? []).filter((g) => g.status === "open")}
						coverage={coverage.data}
						allGapCount={
							(gaps.data ?? []).filter((g) => g.status === "open").length
						}
						unclassifiedRatio={
							unclassified?.status === "insufficient_data"
								? null
								: (unclassified?.v ?? null)
						}
					/>
				</>
			)}

			{showInvoices && (
				<>
					<div className="text-xs tracking-wider uppercase text-foreground/45 mb-4.5">
						Invoices &amp; billing
					</div>
					<InvoiceInsightsPanel data={invoiceInsights.data} />
				</>
			)}
		</div>
	);
}
