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

export default function OverviewPage() {
  const { businessId } = useMe();
  const coverage = useCoverage(businessId);
  const indicators = useIndicatorsMap(businessId);
  const gaps = useGaps(businessId);
  const counterparties = useCounterparties(businessId);

  const rev = indicators.map.REV_MONTHLY?.value_json as { series?: { m: string; v: number }[] } | undefined;
  const cf = indicators.map.OPERATING_CASHFLOW?.value_json as { series?: { m: string; v: number }[] } | undefined;
  const opexRatio = indicators.map.OPEX_RATIO?.value_json as { v?: number; status?: string } | undefined;
  const unclassified = indicators.map.UNCLASSIFIED_RATIO?.value_json as { v?: number; status?: string } | undefined;

  const revenuePoints = seriesToPoints(rev?.series ?? []);
  const cashflowPoints = seriesToPoints(cf?.series ?? []);
  const revenueTotal = seriesTotal(rev?.series);

  return (
    <div className="flex-1 min-w-0 px-7 pt-7.5 pb-10">
      <h1 className="text-[28px] m-0 mb-2">Your readiness overview</h1>
      <p className="text-sm opacity-65 m-0 mb-10">
        Rolling 12-month window, updated whenever new documents come in.
      </p>

      <div className="text-xs tracking-wider uppercase text-ink/45 mb-4.5">Transactions &amp; trends</div>
      <div className="grid gap-[52px] mb-12" style={{ gridTemplateColumns: "1fr 1.3fr 1.3fr" }}>
        <TransactionValueBreakdown
          revenueTotal={revenueTotal}
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
          totalLabel={formatGhs(seriesTotal(cf?.series))}
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
        counterparties={counterparties.data ?? []}
        unclassifiedRatio={unclassified?.status === "insufficient_data" ? null : (unclassified?.v ?? null)}
      />
    </div>
  );
}
