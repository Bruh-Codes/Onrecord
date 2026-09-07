export function formatGhs(pesewas: number): string {
  const cedis = pesewas / 100;
  return `GH¢${cedis.toLocaleString("en-GH", { maximumFractionDigits: cedis % 1 === 0 ? 0 : 2 })}`;
}

export function formatRatio(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${Math.round(v * 100)}%`;
}

/** Convert a value_json series [{m:"2026-01", v:...}] into chart points,
 * filtering months with no data out of the totals. */
export function seriesToPoints(
  series: Array<{ m: string; v: number }>,
  hasX = false
): { month: string; value: number; x: number; y: number }[] {
  return series.map((s) => ({
    month: s.m,
    value: s.v,
    x: hasX ? 0 : s.m.length,
    y: s.v,
  }));
}

export function seriesTotal(series?: Array<{ m: string; v: number }>): number {
  return (series ?? []).reduce((acc, s) => acc + s.v, 0);
}

export function monthLabel(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (!y || !mo || mo < 1 || mo > 12) return m;
  return `${names[mo - 1]} ${String(y).slice(2)}`;
}