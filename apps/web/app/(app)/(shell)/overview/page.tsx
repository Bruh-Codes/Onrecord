"use client";

import { GapsAndCoverage } from "@/components/overview/GapsAndCoverage";
import { TransactionValueBreakdown } from "@/components/overview/TransactionValueBreakdown";
import { TrendChart } from "@/components/overview/TrendChart";
import {
	useCoverage,
	useGaps,
	useIndicatorsMap,
	useMe,
	useCounterparties,
	useInvoiceInsights,
} from "@/lib/hooks/use-business";
import { formatGhs, seriesToPoints, seriesTotal } from "@/lib/format";
import { OverviewPageSkeleton } from "@/components/ui/Skeleton";
import { MetricStat } from "@/components/overview/MetricStat";
import { Dropdown } from "@/components/ui/Dropdown";
import { InvoiceInsightsPanel } from "@/components/overview/InvoiceInsightsPanel";
import { useState } from "react";

type OverviewMode =
	| "executive"
	| "transactions"
	| "revenue"
	| "profitability"
	| "cashflow"
	| "coverage";

type SourceScope = "statements" | "invoices" | "other";

const MODES: { value: OverviewMode; label: string }[] = [
	{ value: "executive", label: "Executive overview" },
	{ value: "transactions", label: "Transactions" },
	{ value: "revenue", label: "Revenue" },
	{ value: "profitability", label: "Profitability" },
	{ value: "cashflow", label: "Cash flow" },
	{ value: "coverage", label: "Coverage" },
];

const PERIODS = [
	{ value: 3, label: "Last 3 months" },
	{ value: 6, label: "Last 6 months" },
	{ value: 12, label: "Trailing 12 months" },
];

const SOURCE_SCOPES: { value: SourceScope; label: string }[] = [
	{ value: "statements", label: "Statements" },
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
	const counterparties = useCounterparties(businessId);
	const invoiceInsights = useInvoiceInsights(businessId);

	if (
		!businessId ||
		coverage.isLoading ||
		indicators.isLoading ||
		gaps.isLoading ||
		counterparties.isLoading ||
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
		(gaps.data ?? []).some((gap) => gap.status === "open") ||
		(counterparties.data?.items ?? []).length > 0;
	const modeOptions = MODES.filter(
		(item) => !(item.value === "coverage" && !coverageAvailable),
	);
	const selectedRevenuePoints = seriesToPoints(selectedRevenueSeries);
	const selectedCashflowPoints = seriesToPoints(selectedCashflowSeries);
	const selectedNetCashflowPoints = seriesToPoints(selectedNetCashflow);
	const showCash = sourceScope === "statements";
	const showInvoices = sourceScope === "invoices";

	const viewSelect = (
		<label className="flex items-center gap-2 text-[13px] text-ink/65">
			<span>View</span>
			<Dropdown
				value={mode}
				options={modeOptions}
				onChange={(value) => setMode(value)}
			/>
		</label>
	);
	const periodSelect = (
		<label className="flex items-center gap-2 text-[13px] text-ink/65">
			<span>Period</span>
			<Dropdown
				value={periodMonths}
				options={PERIODS}
				onChange={(value) => setPeriodMonths(value)}
			/>
		</label>
	);
	const sourceSelect = (
		<label className="flex items-center gap-2 text-[13px] text-ink/65">
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
					<h1 className="text-[24px] sm:text-[28px] m-0 mb-2">Your readiness overview</h1>
					<p className="text-sm opacity-65 m-0">Rolling 12-month window, updated whenever new documents come in.</p>
				</div>
				{sourceSelect}
			</div>

			{sourceScope === "other" && (
				<div className="rounded-xl border border-border/70 p-5 mb-10 text-sm text-ink/65">
					Other documents contribute supporting evidence and readiness coverage. They do not represent cashflow or invoice totals.
				</div>
			)}

			{showCash && <div className="text-xs tracking-wider uppercase text-ink/45 mb-4.5">
				{mode === "executive"
					? "Transactions & trends"
					: `${modeLabel} insights`}
			</div>}
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
					</div>
					<div>
						<div className="mb-4">{periodSelect}</div>
						<TrendChart
							title={`Revenue, ${periodLabel.toLowerCase()}`}
							totalLabel={formatGhs(revenueTotal)}
							series={selectedRevenuePoints}
								color="var(--color-ink)"
								idleCaption="No revenue recorded in window"
						/>
					</div>
					<TrendChart
						title={`Operating cashflow, ${periodLabel.toLowerCase()}`}
						totalLabel={formatGhs(seriesTotal(selectedCashflowSeries))}
						series={selectedCashflowPoints}
						color="var(--color-muted)"
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
						label="Transaction value"
							value={transactionTotal}
							detail={periodLabel}
					/>
					<MetricStat
						label="Average ticket"
							value={avgTicket}
							detail="Revenue transactions"
					/>
					<MetricStat
						label="Active trading days"
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
						label="Revenue"
						value={revenueTotal}
						detail={periodLabel}
					/>
					<MetricStat
						label="Revenue growth"
						value={revenueGrowth}
						unit="ratio"
						detail="Latest 3 months vs prior 3 months"
					/>
					<MetricStat
						label="Average ticket"
						value={avgTicket}
						detail="Revenue transactions"
					/>
				</div>
			)}

			{showCash && mode === "profitability" && (
				<div className="grid gap-5 mb-12 grid-cols-1 md:grid-cols-3">
					<MetricStat
						label="Revenue"
							value={revenueTotal}
							detail={periodLabel}
					/>
					<MetricStat
						label="Operating expense ratio"
						value={
							opexRatio?.status === "insufficient_data"
								? null
								: (opexRatio?.v ?? null)
						}
						unit="ratio"
							detail="Operating expenses / revenue"
					/>
					<MetricStat
						label="Unclassified value"
						value={
							unclassified?.status === "insufficient_data"
								? null
								: transactionTotal * (unclassified?.v ?? 0)
						}
							detail="Needs categorisation"
					/>
				</div>
			)}

			{showCash && mode === "cashflow" && (
				<div className="grid gap-5 mb-12 grid-cols-1 md:grid-cols-3">
					<MetricStat
						label="Operating cashflow"
							value={seriesTotal(selectedCashflowSeries)}
							detail={periodLabel}
					/>
					<MetricStat
						label="Net cashflow"
							value={seriesTotal(selectedNetCashflow)}
							detail={periodLabel}
					/>
					<MetricStat
						label="Negative balance days"
						value={negativeBalanceDays}
							unit="count"
							detail="Within analysis window"
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
						counterparties={counterparties.data?.items ?? []}
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
					<div className="text-xs tracking-wider uppercase text-ink/45 mb-4.5">
						Gaps &amp; coverage
					</div>
					<GapsAndCoverage
						gaps={(gaps.data ?? []).filter((g) => g.status === "open")}
						coverage={coverage.data}
						allGapCount={
							(gaps.data ?? []).filter((g) => g.status === "open").length
						}
						counterparties={counterparties.data?.items ?? []}
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
					<div className="text-xs tracking-wider uppercase text-ink/45 mb-4.5">Invoices &amp; billing</div>
					<InvoiceInsightsPanel data={invoiceInsights.data} />
				</>
			)}
		</div>
	);
}
