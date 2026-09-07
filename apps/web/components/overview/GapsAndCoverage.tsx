import { Badge } from "@/components/ui/Badge";
import { Sparkline } from "@/components/ui/Sparkline";
import Link from "next/link";
import type { Coverage, Counterparty, Gap } from "@/lib/api-types";
import { formatGhs, formatRatio } from "@/lib/format";

export function GapsAndCoverage({
  gaps,
  coverage,
  allGapCount,
  counterparties,
  unclassifiedRatio,
}: {
  gaps: Gap[];
  coverage: Coverage | undefined;
  allGapCount: number;
  counterparties: Counterparty[];
  unclassifiedRatio: number | null;
}) {
  const top = [...counterparties]
    .sort((a, b) => b.total_in_pesewas + b.total_out_pesewas - (a.total_in_pesewas + a.total_out_pesewas))
    .slice(0, 2);

  return (
    <div className="grid gap-[52px]" style={{ gridTemplateColumns: "1.3fr 1fr 1fr" }}>
      <div>
        <div className="text-sm font-semibold mb-3">Open gaps</div>
        {gaps.slice(0, 4).map((gap) => (
          <div key={gap.id} className="py-3 border-b border-ink/8">
            <div className="flex justify-between items-start gap-2.5">
              <div className="text-[13.5px] font-semibold">{gap.title}</div>
              <Badge tone="negative">{gap.severity}</Badge>
            </div>
            <div className="text-xs opacity-60 mt-0.5">{gap.detail ?? gap.code}</div>
          </div>
        ))}
        {gaps.length === 0 && (
          <div className="text-[13.5px] py-3 opacity-70">No open gaps — nice work.</div>
        )}
        <div className="text-[12.5px] opacity-55 mt-2.5">
          {allGapCount > 0 ? (
            <>
              {allGapCount} of {allGapCount} open · <Link href="/gaps">view all</Link>
            </>
          ) : (
            <Link href="/gaps">view gaps</Link>
          )}
        </div>
      </div>
      <div>
        <div className="text-[13px] opacity-65 mb-1.5">Statement coverage</div>
        <div className="font-[family-name:var(--font-display)] text-[22px] mb-0.5">
          {coverage ? coverage.continuous_months : "—"}{" "}
          <span className="text-[13px] opacity-60">of {coverage?.analysis_window_months ?? 12} months</span>
        </div>
        {coverage && unclassifiedRatio != null && (
          <div className="text-xs opacity-60 mt-1">Unclassified value: {formatRatio(unclassifiedRatio)}</div>
        )}
        <Sparkline points="0,55 30,55 60,20 90,55 220,55" color="var(--color-ink)" viewBoxWidth={220} height={70} />
      </div>
      <div>
        <div className="text-sm font-semibold mb-3">Top counterparties by value</div>
        {top.map((c) => {
          const value = c.total_in_pesewas + c.total_out_pesewas;
          return (
            <div key={c.id} className="mb-3">
              <div className="text-[13.5px] font-semibold">{c.canonical_name}</div>
              <div className="text-[11.5px] opacity-60">
                {c.kind === "unknown" ? "unclassified" : c.kind} · {c.txn_count} transaction{c.txn_count === 1 ? "" : "s"}
              </div>
              <div className="text-[13px] font-semibold mt-0.5">{formatGhs(value)}</div>
            </div>
          );
        })}
        {top.length === 0 && <div className="text-[13px] opacity-60">No counterparties yet.</div>}
        <Link href="/counterparties" className="text-[13px] inline-block mt-3.5">
          View all counterparties
        </Link>
      </div>
    </div>
  );
}