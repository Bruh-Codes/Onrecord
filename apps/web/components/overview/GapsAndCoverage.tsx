import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Sparkline } from "@/components/ui/Sparkline";
import { getOpenGaps } from "@/lib/derived";
import type { AppState } from "@/lib/app-state-types";

export function GapsAndCoverage({ state }: { state: AppState }) {
  const gaps = getOpenGaps(state).slice(0, 3);

  return (
    <div className="grid gap-[52px]" style={{ gridTemplateColumns: "1.3fr 1fr 1fr" }}>
      <div>
        <div className="text-sm font-semibold mb-3">Open gaps</div>
        {gaps.map((gap) => (
          <div key={gap.key} className="py-3 border-b border-ink/8">
            <div className="flex justify-between items-start gap-2.5">
              <div className="text-[13.5px] font-semibold">{gap.title}</div>
              <Badge tone="negative">{gap.severity}</Badge>
            </div>
            <div className="text-xs opacity-60 mt-0.5">{gap.detail}</div>
          </div>
        ))}
        <div className="text-[12.5px] opacity-55 mt-2.5">
          {getOpenGaps(state).length} of 4 open · <Link href="/gaps">view all</Link>
        </div>
      </div>
      <div>
        <div className="text-[13px] opacity-65 mb-1.5">Statement coverage</div>
        <div className="font-[family-name:var(--font-display)] text-[22px] mb-0.5">
          9 <span className="text-[13px] opacity-60">of 12 months</span>
        </div>
        <Sparkline points="0,55 30,55 60,20 90,55 220,55" color="#141414" viewBoxWidth={220} height={70} />
      </div>
      <div>
        <div className="text-sm font-semibold mb-3">Top counterparties by value</div>
        <div className="mb-3">
          <div className="text-[13.5px] font-semibold">Adom Ventures</div>
          <div className="text-[11.5px] opacity-60">
            {state.resolved.adomVentures ? "supplier" : "unclassified"} · 34 transactions
          </div>
          <div className="text-[13px] font-semibold mt-0.5">GH¢12,400</div>
        </div>
        <div>
          <div className="text-[13.5px] font-semibold">Nana Yeboah</div>
          <div className="text-[11.5px] opacity-60">
            {state.resolved.oneOff ? "contract payment" : "unclassified"} · 1 transaction
          </div>
          <div className="text-[13px] font-semibold mt-0.5">GH¢18,000</div>
        </div>
        <Link href="/counterparties" className="text-[13px] inline-block mt-3.5">
          View all counterparties
        </Link>
      </div>
    </div>
  );
}
