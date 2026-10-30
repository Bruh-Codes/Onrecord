import { formatGhs, formatRatio } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/document-review";
import { InfoHint } from "./InfoHint";

type BreakdownItem = {
  key: string;
  label: string;
  value: number;
  series?: { m: string; v: number }[];
};

const UNSORTED = "Not sorted yet";

/** The API names categories in accounting terms; show the owner's words. */
function breakdownLabel(key: string, label: string): string {
  if (key === "unclassified" || key === "unknown" || label === "Unclassified") return UNSORTED;
  return CATEGORY_LABELS[key] ?? label;
}

export function TransactionValueBreakdown({
  revenueTotal,
  transactionTotal,
  opexRatio,
  unclassifiedRatio,
  breakdown,
  months,
}: {
  revenueTotal: number;
  transactionTotal: number;
  opexRatio: number | null;
  unclassifiedRatio: number | null;
  breakdown?: BreakdownItem[];
  months?: number;
}) {
  const opexValue = opexRatio != null ? revenueTotal * opexRatio : 0;
  const unclassifiedValue = unclassifiedRatio != null ? Math.round(transactionTotal * unclassifiedRatio) : 0;
  const otherValue = Math.max(0, transactionTotal - revenueTotal - opexValue - unclassifiedValue);

  const total = transactionTotal || 1;

  const colors = ["var(--positive)", "var(--warning)", "var(--muted-foreground)", "var(--destructive)"];
  const dynamicRows = breakdown?.map((item, index) => {
    const values = months && item.series?.length
      ? item.series.slice(-months).reduce((sum, point) => sum + point.v, 0)
      : item.value;
    return { label: breakdownLabel(item.key, item.label), value: values, color: colors[index % colors.length], pct: (values / total) * 100 };
  });
  const rows = dynamicRows?.length ? dynamicRows : [
    { label: "Sales", value: revenueTotal, color: "var(--positive)", pct: (revenueTotal / total) * 100 },
    { label: "Costs", value: opexValue, color: "var(--warning)", pct: (opexValue / total) * 100 },
    { label: "Loans and other money", value: otherValue, color: "var(--muted-foreground)", pct: (otherValue / total) * 100 },
  ];

  const hasData = transactionTotal > 0;

  return (
    <div>
      <div className="flex items-center gap-1.5 text-sm font-semibold mb-3.5">
        Where your money came from and went
        <InfoHint text="All money in and out in this period, except transfers between your own accounts. Money we couldn't place needs sorting before it counts as sales or costs." />
      </div>
      <div className="flex h-6 rounded-lg overflow-hidden mb-4 bg-border/50">
        {hasData ? (
          <>
            {rows.map((r) => (
              <div key={r.label} style={{ width: `${r.pct}%`, background: r.color }} />
            ))}
            {!dynamicRows?.length && unclassifiedValue > 0 && <div style={{ width: `${Math.max(1, (unclassifiedValue / total) * 100)}%`, background: "var(--destructive)" }} />}
          </>
        ) : null}
      </div>
      <div className="flex items-baseline justify-between gap-3 mb-3.5">
        <span className="text-xs uppercase tracking-wider text-foreground/50">Total moved</span>
        <span className="font-display text-xl">{formatGhs(transactionTotal)}</span>
      </div>
      <div className="flex flex-col gap-2.5 text-[13px]">
        {rows.map((r) => (
          <div key={r.label} className={`flex items-center gap-2 ${r.value === 0 ? "opacity-40" : ""}`}>
            <span className="w-[9px] h-[9px] rounded-full shrink-0" style={{ background: r.color }} />
            {r.label}
            <span className="ml-auto font-semibold">{formatGhs(r.value)}</span>
          </div>
        ))}
        {!dynamicRows?.some((row) => row.label === UNSORTED) && (
          <div className={`flex items-center gap-2 ${unclassifiedValue === 0 ? "opacity-40" : ""}`}>
            <span className="w-[9px] h-[9px] rounded-full shrink-0 bg-destructive" />
            {UNSORTED}
            <span className={`ml-auto font-semibold ${unclassifiedValue === 0 ? "" : "text-destructive"}`}>
              {formatGhs(unclassifiedValue)}{unclassifiedValue > 0 ? ` (${formatRatio(unclassifiedRatio)})` : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
