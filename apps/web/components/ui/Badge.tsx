type BadgeTone = "positive" | "negative" | "neutral";

const toneClasses: Record<BadgeTone, string> = {
  positive: "bg-positive-bg text-positive",
  negative: "bg-negative-bg text-negative",
  neutral: "bg-panel-strong text-ink/80",
};

export function Badge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return (
    <span className={`shrink-0 rounded-xl px-3 py-1 text-[11px] ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}
