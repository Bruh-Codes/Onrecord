"use client";

import { useEffect, useRef, useState } from "react";

import { formatGhs } from "@/lib/format";
import { type CashFlowPeriod, compactGhs, monthLabel } from "@/lib/money";

const HEIGHT = 220;
const MARGIN = { top: 16, right: 8, bottom: 28, left: 56 };
const GAP = 2;

function niceMax(value: number): number {
	if (value <= 0) return 100_00;
	const magnitude = 10 ** Math.floor(Math.log10(value));
	const step = [1, 2, 2.5, 5, 10].find((m) => m * magnitude >= value) ?? 10;
	return step * magnitude;
}

/** Bar with a 4px rounded data end and a square baseline end. */
function barPath(x: number, y: number, width: number, height: number): string {
	const r = Math.min(4, width / 2, height);
	return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

export function MonthlyCashFlowChart({ periods }: { periods: CashFlowPeriod[] }) {
	const ref = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(640);
	const [hover, setHover] = useState<number | null>(null);
	const [asTable, setAsTable] = useState(false);

	useEffect(() => {
		const element = ref.current;
		if (!element) return;
		const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
		observer.observe(element);
		return () => observer.disconnect();
	}, [asTable]);

	const max = niceMax(Math.max(0, ...periods.flatMap((p) => [p.money_in_pesewas, p.money_out_pesewas])));
	const plotWidth = width - MARGIN.left - MARGIN.right;
	const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
	const column = plotWidth / Math.max(periods.length, 1);
	const barWidth = Math.max(3, Math.min(22, (column - 10) / 2 - GAP / 2));
	const y = (value: number) => MARGIN.top + plotHeight - (value / max) * plotHeight;
	const ticks = [0, max / 2, max];
	const labelEvery = Math.ceil(periods.length / Math.max(1, Math.floor(plotWidth / 44)));
	const hovered = hover != null ? periods[hover] : null;

	return (
		<div className="[--viz-in:#1a7a4c] [--viz-out:#c17d11] dark:[--viz-in:#45a877] dark:[--viz-out:#c07a20]">
			<div className="mb-3 flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-4 text-[12.5px] text-foreground/70" aria-hidden={asTable}>
					<span className="inline-flex items-center gap-1.5">
						<span className="h-2.5 w-2.5 rounded-sm bg-[var(--viz-in)]" /> Money in
					</span>
					<span className="inline-flex items-center gap-1.5">
						<span className="h-2.5 w-2.5 rounded-sm bg-[var(--viz-out)]" /> Money out
					</span>
				</div>
				<button
					type="button"
					onClick={() => setAsTable((value) => !value)}
					className="bg-transparent border-none p-0 text-[12.5px] font-semibold underline underline-offset-2 cursor-pointer"
				>
					{asTable ? "Show chart" : "Show as table"}
				</button>
			</div>

			{asTable ? (
				<div className="overflow-x-auto">
					<table className="w-full border-collapse text-[13px]">
						<thead>
							<tr className="text-left text-[11px] uppercase tracking-wider text-foreground/45">
								<th className="py-2 font-normal">Month</th>
								<th className="py-2 text-right font-normal">Money in</th>
								<th className="py-2 text-right font-normal">Money out</th>
								<th className="py-2 text-right font-normal">Net</th>
							</tr>
						</thead>
						<tbody>
							{periods.map((p) => (
								<tr key={p.period} className="border-t border-border tabular-nums">
									<td className="py-2">{monthLabel(p.period, true)}</td>
									<td className="py-2 text-right">{formatGhs(p.money_in_pesewas)}</td>
									<td className="py-2 text-right">{formatGhs(p.money_out_pesewas)}</td>
									<td className={`py-2 text-right font-semibold ${p.net_pesewas < 0 ? "text-destructive" : ""}`}>{formatGhs(p.net_pesewas)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<div ref={ref} className="relative">
					<svg
						width={width}
						height={HEIGHT}
						role="img"
						aria-label={`Money in and out for ${periods.length} months`}
						onMouseLeave={() => setHover(null)}
					>
						{ticks.map((tick) => (
							<g key={tick}>
								<line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} className="stroke-foreground/10" />
								<text x={MARGIN.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-foreground/50 text-[11px] tabular-nums">
									{compactGhs(tick)}
								</text>
							</g>
						))}
						{periods.map((p, index) => {
							const center = MARGIN.left + column * index + column / 2;
							const inHeight = y(0) - y(p.money_in_pesewas);
							const outHeight = y(0) - y(p.money_out_pesewas);
							const dimmed = hover != null && hover !== index;
							return (
								<g key={p.period} opacity={dimmed ? 0.45 : 1}>
									{inHeight > 0 && (
										<path d={barPath(center - GAP / 2 - barWidth, y(p.money_in_pesewas), barWidth, inHeight)} fill="var(--viz-in)" />
									)}
									{outHeight > 0 && (
										<path d={barPath(center + GAP / 2, y(p.money_out_pesewas), barWidth, outHeight)} fill="var(--viz-out)" />
									)}
									{index % labelEvery === 0 && (
										<text x={center} y={HEIGHT - 8} textAnchor="middle" className="fill-foreground/55 text-[11px]">
											{monthLabel(p.period)}
										</text>
									)}
									<rect
										x={MARGIN.left + column * index}
										y={MARGIN.top}
										width={column}
										height={plotHeight}
										fill="transparent"
										onMouseEnter={() => setHover(index)}
										onFocus={() => setHover(index)}
										onBlur={() => setHover(null)}
										tabIndex={0}
										aria-label={`${monthLabel(p.period, true)}: in ${formatGhs(p.money_in_pesewas)}, out ${formatGhs(p.money_out_pesewas)}`}
									/>
								</g>
							);
						})}
						<line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(0)} y2={y(0)} className="stroke-foreground/30" />
					</svg>
					{hovered && hover != null && (
						<div
							className="pointer-events-none absolute top-1 z-10 w-[180px] rounded-xl border border-border bg-card px-3 py-2 text-[12px] shadow-card"
							style={{
								left: Math.min(
									Math.max(0, MARGIN.left + column * hover + column / 2 - 90),
									width - 180,
								),
							}}
						>
							<div className="mb-1 font-semibold">{monthLabel(hovered.period, true)}</div>
							<div className="flex justify-between gap-2"><span className="text-foreground/60">Money in</span><span className="tabular-nums">{formatGhs(hovered.money_in_pesewas)}</span></div>
							<div className="flex justify-between gap-2"><span className="text-foreground/60">Money out</span><span className="tabular-nums">{formatGhs(hovered.money_out_pesewas)}</span></div>
							<div className="mt-1 flex justify-between gap-2 border-t border-border pt-1 font-semibold">
								<span>Net</span><span className={`tabular-nums ${hovered.net_pesewas < 0 ? "text-destructive" : ""}`}>{formatGhs(hovered.net_pesewas)}</span>
							</div>
							<div className="mt-0.5 text-[11px] text-foreground/50">{hovered.transactions} transactions</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
