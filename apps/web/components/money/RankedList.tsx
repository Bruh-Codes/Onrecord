import { formatGhs } from "@/lib/format";

export type RankedItem = { key: string; label: string; detail?: string; amount_pesewas: number; share: string | null };

/** A ranked list with a single-hue share bar per row (magnitude, not identity). */
export function RankedList({
	title,
	items,
	tone,
	empty,
}: {
	title: string;
	items: RankedItem[];
	tone: "in" | "out";
	empty: string;
}) {
	const max = Math.max(1, ...items.map((item) => item.amount_pesewas));
	return (
		<section className="rounded-2xl border border-border bg-card p-4 sm:p-5 [--viz-in:#1a7a4c] [--viz-out:#c17d11] dark:[--viz-in:#45a877] dark:[--viz-out:#c07a20]">
			<h2 className="m-0 mb-3 text-[15px] font-semibold font-[family-name:var(--body-font)]">{title}</h2>
			{items.length === 0 ? (
				<p className="m-0 text-[12.5px] text-foreground/55">{empty}</p>
			) : (
				<ol className="m-0 list-none space-y-3 p-0">
					{items.map((item) => (
						<li key={item.key}>
							<div className="flex items-baseline justify-between gap-3 text-[13px]">
								<span className="min-w-0 truncate font-semibold" title={item.label}>{item.label}</span>
								<span className="shrink-0 tabular-nums">{formatGhs(item.amount_pesewas)}</span>
							</div>
							<div className="mt-1 flex items-center gap-2">
								<div className="h-1.5 flex-1 rounded-full bg-muted">
									<div
										className={`h-1.5 rounded-full ${tone === "in" ? "bg-[var(--viz-in)]" : "bg-[var(--viz-out)]"}`}
										style={{ width: `${Math.max(2, (item.amount_pesewas / max) * 100)}%` }}
									/>
								</div>
								<span className="w-24 shrink-0 text-right text-[11.5px] text-foreground/55">
									{[item.share, item.detail].filter(Boolean).join(" · ")}
								</span>
							</div>
						</li>
					))}
				</ol>
			)}
		</section>
	);
}
