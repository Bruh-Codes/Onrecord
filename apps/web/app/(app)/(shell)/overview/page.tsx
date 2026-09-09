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
} from "@/lib/hooks/use-business";
import { formatGhs, seriesToPoints, seriesTotal } from "@/lib/format";
import { OverviewPageSkeleton } from "@/components/ui/Skeleton";
import { MetricStat } from "@/components/overview/MetricStat";
import { useState } from "react";

type OverviewMode = "executive" | "transactions" | "revenue" | "profitability" | "cashflow" | "coverage";

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

function indicatorValue(indicator: { value_json: Record<string, unknown> } | undefined): number | null {
  const value = indicator?.value_json?.v;
  return typeof value === "number" ? value : null;
}

export default function OverviewPage() {
  const [mode, setMode] = useState<OverviewMode>("executive");
  const [periodMonths, setPeriodMonths] = useState(12);
  const { businessId } = useMe();
  const coverage = useCoverage(businessId);
  const indicators = useIndicatorsMap(businessId);
  const gaps = useGaps(businessId);
  const counterparties = useCounterparties(businessId);

if (coverage.isLoading || indicators.isLoading || gaps.isLoading || counterparties.isLoading) {
    return <OverviewPageSkeleton />;
  }

  const rev = indicators.map.REV_MONTHLY?.value_json as { series?: { m: string; v: number }[] } | undefined;
  const cf = indicators.map.OPERATING_CASHFLOW?.value_json as { series?: { m: string; v: number }[] } | undefined;
  const opexRatio = indicators.map.OPEX_RATIO?.value_json as { v?: number; status?: string } | undefined;
  const unclassified = indicators.map.UNCLASSIFIED_RATIO?.value_json as { v?: number; status?: string } | undefined;
  const transactionValue = indicators.map.TRANSACTION_VALUE?.value_json as { v?: number } | undefined;
  const transactionBreakdown = indicators.map.TRANSACTION_VALUE?.value_json?.breakdown as {
    key: string;
    label: string;
    value: number;
    series?: { m: string; v: number }[];
  }[] | undefined;
  const transactionSeries = ((indicators.map.TRANSACTION_VALUE?.value_json?.series ?? []) as { m: string; v: number }[]);
  const avgTicket = indicatorValue(indicators.map.AVG_TICKET);
  const activeTradingDays = indicatorValue(indicators.map.ACTIVE_TRADING_DAYS);
  const revenueGrowth = indicatorValue(indicators.map.REV_GROWTH_3M);
  const netCashflow = ((indicators.map.NET_CASHFLOW?.value_json?.series ?? []) as { m: string; v: number }[]);
  const negativeBalanceDays = indicatorValue(indicators.map.NEGATIVE_BALANCE_DAYS);

  const revenueSeries = Array.isArray(rev?.series) ? rev.series : [];
  const cashflowSeries = Array.isArray(cf?.series) ? cf.series : [];
  const selectedRevenueSeries = revenueSeries.slice(-periodMonths);
  const selectedCashflowSeries = cashflowSeries.slice(-periodMonths);
  const selectedTransactionSeries = transactionSeries.slice(-periodMonths);
  const selectedNetCashflow = netCashflow.slice(-periodMonths);
  const revenueTotal = seriesTotal(selectedRevenueSeries);
  const transactionTotal = transactionSeries.length > 0
    ? seriesTotal(selectedTransactionSeries)
    : (transactionValue?.v ?? revenueTotal);
  const modeLabel = MODES.find((item) => item.value === mode)?.label ?? "Overview";
  const periodLabel = PERIODS.find((period) => period.value === periodMonths)?.label ?? "Selected period";
  const selectedRevenuePoints = seriesToPoints(selectedRevenueSeries);
  const selectedCashflowPoints = seriesToPoints(selectedCashflowSeries);
  const selectedNetCashflowPoints = seriesToPoints(selectedNetCashflow);

  return (
    <div className="flex-1 min-w-0 px-4 sm:px-7 pt-6 sm:pt-7.5 pb-10">
      <h1 className="text-[24px] sm:text-[28px] m-0 mb-2">Your readiness overview</h1>
      <p className="text-sm opacity-65 m-0 mb-10">
        Rolling 12-month window, updated whenever new documents come in.
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-8">
        <label className="flex items-center gap-2 text-[13px] text-ink/65">
          <span>View</span>
          <select value={mode} onChange={(event) => setMode(event.target.value as OverviewMode)} className="rounded-full border border-border bg-transparent px-3 py-2 text-ink">
            {MODES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[13px] text-ink/65">
          <span>Period</span>
          <select value={periodMonths} onChange={(event) => setPeriodMonths(Number(event.target.value))} className="rounded-full border border-border bg-transparent px-3 py-2 text-ink">
            {PERIODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
      </div>

      <div className="text-xs tracking-wider uppercase text-ink/45 mb-4.5">
        {mode === "executive" ? "Transactions & trends" : `${modeLabel} insights`}
      </div>
      {mode === "executive" && <div className="grid gap-[52px] mb-12 grid-cols-1 lg:grid-cols-[1fr_1.3fr_1.3fr]">
        <TransactionValueBreakdown
          revenueTotal={revenueTotal}
          transactionTotal={transactionTotal}
          opexRatio={opexRatio?.status === "insufficient_data" ? null : (opexRatio?.v ?? null)}
          unclassifiedRatio={unclassified?.status === "insufficient_data" ? null : (unclassified?.v ?? null)}
          breakdown={transactionBreakdown}
          months={periodMonths}
        />
        <TrendChart
          title={`Revenue, ${periodLabel.toLowerCase()}`}
          totalLabel={formatGhs(revenueTotal)}
          series={selectedRevenuePoints}
          color="var(--color-ink)"
          idleCaption="No revenue recorded in window"
        />
        <TrendChart
          title={`Operating cashflow, ${periodLabel.toLowerCase()}`}
          totalLabel={formatGhs(seriesTotal(selectedCashflowSeries))}
          series={selectedCashflowPoints}
          color="var(--color-muted)"
          idleCaption={`Coverage: ${coverage.data?.continuous_months ?? 0}/${coverage.data?.analysis_window_months ?? 12} months`}
        />
      </div>}

      {mode === "transactions" && <div className="grid gap-5 mb-12 grid-cols-1 md:grid-cols-3">
        <MetricStat label="Transaction value" value={transactionTotal} detail={periodLabel} />
        <MetricStat label="Average ticket" value={avgTicket} detail="Revenue transactions" />
        <MetricStat label="Active trading days" value={activeTradingDays} unit="count" detail={periodLabel} />
        <div className="md:col-span-3"><TransactionValueBreakdown revenueTotal={revenueTotal} transactionTotal={transactionTotal} opexRatio={null} unclassifiedRatio={null} breakdown={transactionBreakdown} months={periodMonths} /></div>
      </div>}

      {mode === "revenue" && <div className="grid gap-5 mb-12 grid-cols-1 md:grid-cols-3">
        <MetricStat label="Revenue" value={revenueTotal} detail={periodLabel} />
        <MetricStat label="Revenue growth" value={revenueGrowth} unit="ratio" detail="Latest 3 months vs prior 3 months" />
        <MetricStat label="Average ticket" value={avgTicket} detail="Revenue transactions" />
        <div className="md:col-span-3"><TrendChart title={`Revenue, ${periodLabel.toLowerCase()}`} totalLabel={formatGhs(revenueTotal)} series={selectedRevenuePoints} color="var(--color-ink)" idleCaption="No revenue recorded in window" /></div>
      </div>}

      {mode === "profitability" && <div className="grid gap-5 mb-12 grid-cols-1 md:grid-cols-3">
        <MetricStat label="Revenue" value={revenueTotal} detail={periodLabel} />
        <MetricStat label="Operating expense ratio" value={opexRatio?.status === "insufficient_data" ? null : (opexRatio?.v ?? null)} unit="ratio" detail="Operating expenses / revenue" />
        <MetricStat label="Unclassified value" value={unclassified?.status === "insufficient_data" ? null : (transactionTotal * (unclassified?.v ?? 0))} detail="Needs categorisation" />
        <div className="md:col-span-3"><TrendChart title={`Operating cashflow, ${periodLabel.toLowerCase()}`} totalLabel={formatGhs(seriesTotal(selectedCashflowSeries))} series={selectedCashflowPoints} color="var(--color-muted)" idleCaption="No operating cashflow recorded" /></div>
      </div>}

      {mode === "cashflow" && <div className="grid gap-5 mb-12 grid-cols-1 md:grid-cols-3">
        <MetricStat label="Operating cashflow" value={seriesTotal(selectedCashflowSeries)} detail={periodLabel} />
        <MetricStat label="Net cashflow" value={seriesTotal(selectedNetCashflow)} detail={periodLabel} />
        <MetricStat label="Negative balance days" value={negativeBalanceDays} unit="count" detail="Within analysis window" />
        <div className="md:col-span-3 grid gap-10 md:grid-cols-2"><TrendChart title="Operating cashflow" totalLabel={formatGhs(seriesTotal(selectedCashflowSeries))} series={selectedCashflowPoints} color="var(--color-muted)" idleCaption="No operating cashflow recorded" /><TrendChart title="Net cashflow" totalLabel={formatGhs(seriesTotal(selectedNetCashflow))} series={selectedNetCashflowPoints} color="var(--color-ink)" idleCaption="No net cashflow recorded" /></div>
      </div>}

      {mode === "coverage" && <div className="mb-12"><GapsAndCoverage gaps={(gaps.data ?? []).filter((g) => g.status === "open")} coverage={coverage.data} allGapCount={(gaps.data ?? []).filter((g) => g.status === "open").length} counterparties={counterparties.data?.items ?? []} unclassifiedRatio={unclassified?.status === "insufficient_data" ? null : (unclassified?.v ?? null)} /></div>}

      {mode !== "coverage" && <>
        <div className="h-px bg-border mb-10" />
        <div className="text-xs tracking-wider uppercase text-ink/45 mb-4.5">Gaps &amp; coverage</div>
        <GapsAndCoverage
          gaps={(gaps.data ?? []).filter((g) => g.status === "open")}
          coverage={coverage.data}
          allGapCount={(gaps.data ?? []).filter((g) => g.status === "open").length}
          counterparties={counterparties.data?.items ?? []}
          unclassifiedRatio={unclassified?.status === "insufficient_data" ? null : (unclassified?.v ?? null)}
        />
      </>}
    </div>
  );
}
