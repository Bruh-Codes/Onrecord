import { formatGhs, formatRatio } from "@/lib/format";
import { InfoHint } from "./InfoHint";

const METRIC_INFO: Record<string, string> = {
	Sales: "Money in that we could tell came from customers. Transfers between your own accounts, loans and money you put in are left out.",
	"Sales growth": "How much your sales in the last 3 months went up or down compared with the 3 months before.",
	"Average sale": "The usual size of one payment from a customer.",
	"Days with sales": "How many different days a customer paid you.",
	"Costs as a share of sales": "Your running costs divided by your sales. 60% means GH¢0.60 of every GH¢1 you sell goes on costs. Lower is better.",
	"Cash left after running costs": "Sales minus stock, materials and running costs. Loans and money you put in or took out are left out.",
	"Money in minus money out": "Everything that came in minus everything that went out, except transfers between your own accounts.",
	"Days the account was empty": "Days your statement balance was zero or below.",
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
			<div className="flex items-center gap-1.5 text-[12px] uppercase text-foreground/50">
				{label}
				{(info ?? METRIC_INFO[label]) && (
					<InfoHint text={info ?? METRIC_INFO[label]} />
				)}
			</div>
			<div
				className="text-[24px] mt-2"
				style={value != null && value < 0 ? { color: "var(--destructive)" } : undefined}
			>
				{formatted}
			</div>
			{detail && <div className="text-sm text-foreground/55 mt-1">{detail}</div>}
		</div>
	);
}
