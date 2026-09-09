import { formatGhs, formatRatio } from "@/lib/format";

export function MetricStat({
  label,
  value,
  unit = "money",
  detail,
}: {
  label: string;
  value: number | null;
  unit?: "money" | "ratio" | "count";
  detail?: string;
}) {
  const formatted = value == null
    ? "—"
    : unit === "money"
      ? formatGhs(value)
      : unit === "ratio"
        ? formatRatio(value)
        : value.toLocaleString();

  return (
    <div className="rounded-xl border border-border/70 p-4">
      <div className="text-[12px] uppercase tracking-wider text-ink/50">{label}</div>
      <div className="font-[family-name:var(--font-display)] text-[24px] mt-2">{formatted}</div>
      {detail && <div className="text-xs text-ink/55 mt-1">{detail}</div>}
    </div>
  );
}
