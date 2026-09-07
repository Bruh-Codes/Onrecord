import { formatGhs, formatRatio } from "@/lib/format";

export function TransactionValueBreakdown({
  revenueTotal,
  opexRatio,
  unclassifiedRatio,
}: {
  revenueTotal: number;
  opexRatio: number | null;
  unclassifiedRatio: number | null;
}) {
  const opexValue = opexRatio != null ? revenueTotal * opexRatio : 0;
  const unclassifiedValue = unclassifiedRatio != null ? Math.round(revenueTotal * unclassifiedRatio) : 0;
  const otherValue = Math.max(0, revenueTotal - opexValue - unclassifiedValue);
  const total = revenueTotal || 1;

  const rows = [
    { label: "Revenue", value: revenueTotal, color: "var(--color-positive)", pct: (revenueTotal / total) * 100 },
    { label: "COGS + opex", value: opexValue, color: "var(--color-amber)", pct: (opexValue / total) * 100 },
    { label: "Other / financing", value: otherValue, color: "var(--color-muted)", pct: (otherValue / total) * 100 },
  ].filter((r) => r.value > 0);

  return (
    <div>
      <div className="text-sm font-semibold mb-3.5">Transaction value</div>
      <div className="flex h-6 rounded-lg overflow-hidden mb-4">
        {rows.map((r) => (
          <div key={r.label} style={{ width: `${r.pct}%`, background: r.color }} />
        ))}
        {unclassifiedValue > 0 && <div style={{ width: `${Math.max(1, (unclassifiedValue / total) * 100)}%`, background: "var(--color-negative)" }} />}
      </div>
      <div className="flex flex-col gap-2.5 text-[13px]">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2">
            <span className="w-[9px] h-[9px] rounded-full shrink-0" style={{ background: r.color }} />
            {r.label}
            <span className="ml-auto font-semibold">{formatGhs(r.value)}</span>
          </div>
        ))}
        {unclassifiedValue > 0 && (
          <div className="flex items-center gap-2">
            <span className="w-[9px] h-[9px] rounded-full shrink-0 bg-negative" />
            Unclassified
            <span className="ml-auto font-semibold text-negative">
              {formatGhs(unclassifiedValue)} ({formatRatio(unclassifiedRatio)})
            </span>
          </div>
        )}
      </div>
    </div>
  );
}