"use client";

import { GapsAndCoverage } from "@/components/overview/GapsAndCoverage";
import { TransactionValueBreakdown } from "@/components/overview/TransactionValueBreakdown";
import { TrendChart } from "@/components/overview/TrendChart";
import { useAppState } from "@/lib/app-state";
import { getCashBufferDays } from "@/lib/derived";
import { CASHFLOW_SERIES, REVENUE_SERIES } from "@/lib/mock-data";

export default function OverviewPage() {
  const state = useAppState();
  const cashBufferDays = getCashBufferDays(state);

  return (
    <div className="flex-1 min-w-0 px-4 sm:px-7 pt-6 sm:pt-7.5 pb-10">
      <h1 className="text-[24px] sm:text-[28px] m-0 mb-2">Your readiness overview</h1>
      <p className="text-sm opacity-65 m-0 mb-10">
        Rolling 12-month window, updated whenever new documents come in.
      </p>

      <div className="text-xs tracking-wider uppercase text-ink/45 mb-4.5">Transactions &amp; trends</div>
      <div className="grid grid-cols-1 gap-8 mb-12 md:grid-cols-[1fr_1.3fr_1.3fr] md:gap-[52px]">
        <TransactionValueBreakdown state={state} />
        <TrendChart
          title="Revenue, trailing 12mo"
          totalLabel="GH¢184,300"
          series={REVENUE_SERIES}
          color="var(--color-ink)"
          idleCaption="GH¢12,400 previous window"
        />
        <TrendChart
          title="Operating cashflow, trailing 12mo"
          totalLabel="GH¢58,200"
          series={CASHFLOW_SERIES}
          color="var(--color-muted)"
          idleCaption={`Cash buffer: ${cashBufferDays} days`}
        />
      </div>

      <div className="h-px bg-border mb-10" />

      <div className="text-xs tracking-wider uppercase text-ink/45 mb-4.5">Gaps &amp; coverage</div>
      <GapsAndCoverage state={state} />
    </div>
  );
}
