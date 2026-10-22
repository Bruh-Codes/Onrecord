type BadgeTone = "positive" | "negative" | "warning" | "neutral";

const toneClasses: Record<BadgeTone, string> = {
  positive: "bg-positive-background text-positive",
  negative: "bg-destructive-background text-destructive",
  warning: "bg-warning/15 text-foreground",
  neutral: "bg-accent text-foreground/80",
};

export function Badge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return (
    <span className={`shrink-0 rounded-xl px-3 py-1 text-[11px] ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}
