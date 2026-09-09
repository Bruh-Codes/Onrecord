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
import { Skeleton } from "@/components/ui/Skeleton";

export default function OverviewPage() {
  const { businessId } = useMe();
  const coverage = useCoverage(businessId);
  const indicators = useIndicatorsMap(businessId);
  const gaps = useGaps(businessId);
  const counterparties = useCounterparties(businessId);

  if (coverage.isLoading || indicators.isLoading || gaps.isLoading || counterparties.isLoading) {
    return (
      <div className="flex-1 min-w-0 px-4 sm:px-7 pt-6 sm:pt-7.5 pb-10" aria-busy="true" aria-label="Loading readiness overview">
        <Skeleton className="h-9 w-80 mb-3" />
        <Skeleton className="h-4 w-[430px] max-w-full mb-10" />
        <Skeleton className="h-3 w-36 mb-5" />
        <div className="grid gap-[52px] mb-12 grid-cols-1 lg:grid-cols-[1fr_1.3fr_1.3fr]"><Skeleton className="h-[260px]" /><Skeleton className="h-[260px]" /><Skeleton className="h-[260px]" /></div>
        <Skeleton className="h-px w-full mb-10" />
        <Skeleton className="h-3 w-28 mb-5" />
        <div className="grid gap-[52px] grid-cols-1 lg:grid-cols-[1.3fr_1fr_1fr]"><Skeleton className="h-44" /><Skeleton className="h-44" /><Skeleton className="h-44" /></div>
      </div>
    );
  }

  const rev = indicators.map.REV_MONTHLY?.value_json as { series?: { m: string; v: number }[] } | undefined;
  const cf = indicators.map.OPERATING_CASHFLOW?.value_json as { series?: { m: string; v: number }[] } | undefined;
  const opexRatio = indicators.map.OPEX_RATIO?.value_json as { v?: number; status?: string } | undefined;
  const unclassified = indicators.map.UNCLASSIFIED_RATIO?.value_json as { v?: number; status?: string } | undefined;
  const transactionValue = indicators.map.TRANSACTION_VALUE?.value_json as { v?: number } | undefined;

  const revenueSeries = Array.isArray(rev?.series) ? rev.series : [];
  const cashflowSeries = Array.isArray(cf?.series) ? cf.series : [];
  const revenuePoints = seriesToPoints(revenueSeries);
  const cashflowPoints = seriesToPoints(cashflowSeries);
  const revenueTotal = seriesTotal(revenueSeries);

  return (
    <div className="flex-1 min-w-0 px-4 sm:px-7 pt-6 sm:pt-7.5 pb-10">
      <h1 className="text-[24px] sm:text-[28px] m-0 mb-2">Your readiness overview</h1>
      <p className="text-sm opacity-65 m-0 mb-10">
        Rolling 12-month window, updated whenever new documents come in.
      </p>

      <div className="text-xs tracking-wider uppercase text-ink/45 mb-4.5">Transactions &amp; trends</div>
      <div className="grid gap-[52px] mb-12 grid-cols-1 lg:grid-cols-[1fr_1.3fr_1.3fr]">
        <TransactionValueBreakdown
          revenueTotal={revenueTotal}
          transactionTotal={transactionValue?.v ?? revenueTotal}
          opexRatio={opexRatio?.status === "insufficient_data" ? null : (opexRatio?.v ?? null)}
          unclassifiedRatio={unclassified?.status === "insufficient_data" ? null : (unclassified?.v ?? null)}
        />
        <TrendChart
          title="Revenue, trailing 12mo"
          totalLabel={formatGhs(revenueTotal)}
          series={revenuePoints}
          color="var(--color-ink)"
          idleCaption="No revenue recorded in window"
        />
        <TrendChart
          title="Operating cashflow, trailing 12mo"
          totalLabel={formatGhs(seriesTotal(cashflowSeries))}
          series={cashflowPoints}
          color="var(--color-muted)"
          idleCaption={`Coverage: ${coverage.data?.continuous_months ?? 0}/${coverage.data?.analysis_window_months ?? 12} months`}
        />
      </div>

      <div className="h-px bg-border mb-10" />

      <div className="text-xs tracking-wider uppercase text-ink/45 mb-4.5">Gaps &amp; coverage</div>
      <GapsAndCoverage
        gaps={(gaps.data ?? []).filter((g) => g.status === "open")}
        coverage={coverage.data}
        allGapCount={(gaps.data ?? []).filter((g) => g.status === "open").length}
        counterparties={counterparties.data?.items ?? []}
        unclassifiedRatio={unclassified?.status === "insufficient_data" ? null : (unclassified?.v ?? null)}
      />
    </div>
  );
}
