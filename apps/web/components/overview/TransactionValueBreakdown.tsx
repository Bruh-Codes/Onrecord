import { getUnclassifiedValue } from "@/lib/derived";
import type { AppState } from "@/lib/app-state-types";

const ROWS = [
  { label: "Revenue", value: "GH¢184,300", color: "var(--color-positive)", widthPct: 60 },
  { label: "COGS + opex", value: "GH¢100,100", color: "var(--color-amber)", widthPct: 20 },
  { label: "Financing / owner", value: "GH¢24,000", color: "var(--color-muted)", widthPct: 13 },
];

export function TransactionValueBreakdown({ state }: { state: AppState }) {
  const unclassifiedValue = getUnclassifiedValue(state);

  return (
    <div>
      <div className="text-sm font-semibold mb-3.5">Transaction value</div>
      <div className="flex h-6 rounded-lg overflow-hidden mb-4">
        {ROWS.map((r) => (
          <div key={r.label} style={{ width: `${r.widthPct}%`, background: r.color }} />
        ))}
        <div style={{ width: "7%", background: "var(--color-negative)" }} />
      </div>
      <div className="flex flex-col gap-2.5 text-[13px]">
        {ROWS.map((r) => (
          <div key={r.label} className="flex items-center gap-2">
            <span className="w-[9px] h-[9px] rounded-full shrink-0" style={{ background: r.color }} />
            {r.label}
            <span className="ml-auto font-semibold">{r.value}</span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <span className="w-[9px] h-[9px] rounded-full shrink-0 bg-negative" />
          Unclassified
          <span className="ml-auto font-semibold text-negative">{unclassifiedValue}</span>
        </div>
      </div>
      <a href="#ledger" className="text-[13px] inline-block mt-4">
        View ledger
      </a>
    </div>
  );
}
