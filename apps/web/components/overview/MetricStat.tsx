import { formatGhs, formatRatio } from "@/lib/format";
import { InfoHint } from "./InfoHint";

const METRIC_INFO: Record<string, string> = {
	"Transaction value":
		"The total value of non-internal transactions in the selected period, including classified and unclassified activity.",
	"Average ticket": "Average value of each transaction classified as revenue.",
	"Active trading days":
		"The number of distinct dates with non-internal transaction activity.",
	Revenue:
		"Incoming transactions confidently classified as customer or sales revenue. Internal transfers are excluded.",
	"Revenue growth":
		"The percentage change in revenue between the latest three months and the preceding three months.",
	"Operating expense ratio":
		"Operating expenses divided by revenue. It is unavailable when no revenue has been recorded.",
	"Unclassified value":
		"The value of transactions that do not yet have a confident category.",
	"Operating cashflow":
		"Revenue inflows minus operating expenses. Internal transfers and other excluded activity are not counted.",
	"Net cashflow":
		"All included cash inflows minus all included cash outflows in the selected period.",
	"Negative balance days":
		"The number of days on which the recorded balance was negative.",
};

export function MetricStat({
	label,
	value,
	unit = "money",
	detail,
	info,
}: {
	label: string;
	value: number | null;
	unit?: "money" | "ratio" | "count";
	detail?: string;
	info?: string;
}) {
	const formatted =
		value == null
			? "—"
			: unit === "money"
				? formatGhs(value)
				: unit === "ratio"
					? formatRatio(value)
					: value.toLocaleString();

	return (
		<div className="rounded-xl border border-border/70 p-4">
			<div className="flex items-center gap-1.5 text-[12px] uppercase text-ink/50">
				{label}
				{(info ?? METRIC_INFO[label]) && (
					<InfoHint text={info ?? METRIC_INFO[label]} />
				)}
			</div>
			<div className={`text-[24px] mt-2 ${value != null && value < 0 ? "text-negative" : ""}`}>
				{formatted}
			</div>
			{detail && <div className="text-sm text-ink/55 mt-1">{detail}</div>}
		</div>
	);
}
