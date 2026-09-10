"use client";

import { useState } from "react";
import type { SeriesPoint } from "@/lib/types";
import { InfoHint } from "./InfoHint";

const VIEW_WIDTH = 320;
const VIEW_HEIGHT = 90;

const CHART_INFO: Record<string, string> = {
	"Operating cashflow": "Monthly revenue inflows minus operating expenses. A negative value means operating outflows exceeded operating inflows.",
	"Net cashflow": "Monthly total cash inflows minus total cash outflows after excluded activity is removed.",
};

export function TrendChart({
	title,
	totalLabel,
	series,
	color,
	idleCaption,
	info,
}: {
	title: string;
	totalLabel: string;
	series: SeriesPoint[];
	color: string;
	idleCaption: string;
	info?: string;
}) {
	const [hoverIndex, setHoverIndex] = useState<number | null>(null);
	const hovered = hoverIndex != null ? series[hoverIndex] : null;
	const hasData = series.length > 0;
	const isNegative = totalLabel.includes("-");
	const linePoints = hasData
		? series.map((p) => `${p.x},${p.y}`).join(" ")
		: `0,${VIEW_HEIGHT / 2} ${VIEW_WIDTH},${VIEW_HEIGHT / 2}`;

	return (
		<div>
			<div className="flex items-center gap-1.5 text-[13px] text-ink/65 mb-1.5">
				{title}
				{(info ?? CHART_INFO[title.split(",")[0]]) && (
					<InfoHint text={info ?? CHART_INFO[title.split(",")[0]]} />
				)}
			</div>
			<div
				className="font-[family-name:var(--font-display)] text-[26px] mb-0.5"
				style={isNegative ? { color: "var(--color-negative)" } : undefined}
			>
				{totalLabel}
			</div>
			<div className="text-[12px] text-ink/55 mb-3.5">
				{hovered
					? `${hovered.month}-GH¢${hovered.value.toLocaleString()}`
					: hasData
						? "Hover to inspect monthly values"
						: idleCaption}
			</div>
			<div className="relative overflow-visible">
				<svg
					width="100%"
					height={VIEW_HEIGHT}
					viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
					preserveAspectRatio="none"
					className="overflow-visible"
				>
					<polyline
						points={linePoints}
						fill="none"
						stroke={hasData ? color : "var(--color-border)"}
						strokeWidth="2.2"
						strokeDasharray={hasData ? undefined : "1 6"}
					/>
					{series.map((p, i) => (
						<circle
							key={p.month}
							cx={p.x}
							cy={p.y}
							r={8}
							fill="transparent"
							className="cursor-pointer"
							onMouseEnter={() => setHoverIndex(i)}
							onMouseLeave={() => setHoverIndex(null)}
						/>
					))}
					{series.map((p, i) => (
						<circle
							key={`${p.month}-dot`}
							cx={p.x}
							cy={p.y}
							r={hoverIndex === i ? 5 : 3}
							fill={color}
							className="pointer-events-none"
						/>
					))}
				</svg>
				{hovered && (
					<div
						className="absolute -translate-x-1/2 -translate-y-[130%] whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] text-paper pointer-events-none"
						style={{
							left: `${(hovered.x / VIEW_WIDTH) * 100}%`,
							top: `${(hovered.y / VIEW_HEIGHT) * 100}%`,
							background: color,
						}}
					>
						{hovered.month}-GH¢{hovered.value.toLocaleString()}
					</div>
				)}
			</div>
			<div className="flex justify-between text-[11px] text-ink/50 mt-1">
				{series.length > 0 && (
					<>
						<span>{series[0].month}</span>
						<span>{series[series.length - 1].month}</span>
					</>
				)}
			</div>
		</div>
	);
}
