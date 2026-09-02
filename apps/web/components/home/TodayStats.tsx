import { Sparkline } from "@/components/ui/Sparkline";
import { getCoverage, getScore } from "@/lib/derived";
import type { AppState } from "@/lib/app-state-types";

export function TodayStats({ state }: { state: AppState }) {
  const coverage = getCoverage(state);
  const score = getScore(state);
  const coverageColor = coverage.positive ? "#1e6b45" : "#a13327";
  const scoreColor = score.total >= 65 ? "#1e6b45" : score.total >= 40 ? "#8a8a87" : "#a13327";

  return (
    <div className="flex gap-12 flex-wrap">
      <div className="flex-1 min-w-[260px]">
        <div className="text-[13px] opacity-65 mb-2.5">Statement coverage</div>
        <div className="font-[family-name:var(--font-display)] text-[30px] mb-0.5" style={{ color: coverageColor }}>
          {coverage.label}
        </div>
        <div className="text-xs opacity-55 mb-3.5">{coverage.detail}</div>
        <Sparkline points="0,44 40,44 70,10 100,44 220,44" color={coverageColor} />
      </div>
      <div className="flex-1 min-w-[260px]">
        <div className="text-[13px] opacity-65 mb-2.5">Readiness score</div>
        <div className="font-[family-name:var(--font-display)] text-[30px] mb-0.5" style={{ color: scoreColor }}>
          {score.total} <span className="text-[15px] opacity-50">/ 100</span>
        </div>
        <div className="text-xs opacity-55 mb-3.5">{score.band} · not a credit decision</div>
        <Sparkline points="0,30 40,30 70,36 100,20 220,20" color={scoreColor} />
      </div>
      <div className="w-[220px] shrink-0">
        <div className="text-[13px] opacity-65 mb-2.5">Next request</div>
        <div className="text-[18px] font-semibold mb-0.5">3 Feb – 3 May</div>
        <div className="text-xs opacity-55">MoMo statement window</div>
      </div>
    </div>
  );
}
