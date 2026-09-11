import { Dropdown } from "@/components/ui/Dropdown";
import { PillButton } from "@/components/ui/PillButton";
import { formatGhs } from "@/lib/format";
import type { TransactionReviewItem } from "@/lib/api-types";
import { useState } from "react";

const CATEGORY_OPTIONS = [
	{ value: "revenue", label: "Revenue" },
	{ value: "cogs", label: "Cost of sales" },
	{ value: "opex", label: "Operating expense" },
	{ value: "tax", label: "Tax" },
	{ value: "financing_in", label: "Financing in" },
	{ value: "financing_out", label: "Financing out" },
	{ value: "owner", label: "Owner activity" },
	{ value: "internal", label: "Internal transfer" },
	{ value: "unknown", label: "Leave unclassified" },
] as const;

export function ReviewDetailPanel({
	item,
	onSave,
	busy,
}: {
	item: TransactionReviewItem;
	onSave: (category: string) => void;
	busy?: boolean;
}) {
	const suggestion = item.ai_suggestion;
	const suggestionLabel = suggestion?.category_l1?.replaceAll("_", " ");
	const [category, setCategory] = useState(suggestion?.category_l1 ?? "unknown");
	return (
		<div className="bg-card rounded-[20px] p-5 shadow-card">
			<div className="text-[11px] tracking-wider uppercase text-foreground/55 mb-2.5">
				Classify transaction
			</div>
			<div className="rounded-2xl bg-muted p-4 mb-4">
				<div className="text-[13px] font-semibold mb-1">{item.counterparty_raw || "Unidentified transaction"}</div>
				<div className="text-xs text-foreground/60">{item.occurred_on} · {item.direction === "in" ? "Inflow" : "Outflow"} · {item.document_filename}</div>
				{item.document_type && <div className="mt-1 text-[11px] text-foreground/45">Source type: {item.document_type.replaceAll("_", " ")}</div>}
				<div className="font-display text-2xl mt-3">{formatGhs(item.amount_pesewas)}</div>
			</div>
			{suggestion ? (
				<div className="mb-4 rounded-xl border border-positive/30 bg-positive-background px-3 py-2 text-xs">
					<div className="font-semibold">AI suggests {suggestionLabel}</div>
					<div className="text-foreground/60">{Math.round(suggestion.confidence * 100)}% confidence · {suggestion.basis ?? "Based on the extracted transaction description and direction."}</div>
				</div>
			) : (
				<div className="mb-4 rounded-xl border border-border px-3 py-2 text-xs text-foreground/60">The model could not make a confident suggestion. Choose a category only if the source supports it.</div>
			)}
			<div className="text-[11px] text-foreground/55 mb-1">Save category decision</div>
			<div className="mb-4">
				<Dropdown
					value={category}
					options={CATEGORY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
					onChange={setCategory}
				/>
			</div>
			<PillButton variant="success" className="w-full" disabled={busy} onClick={() => onSave(category)}>
				Save classification
			</PillButton>
			<p className="m-0 text-xs text-foreground/55">Saving marks this decision as human-reviewed and refreshes the business insights.</p>
			{busy && <div className="mt-3 text-xs text-foreground/60">Saving and recalculating…</div>}
		</div>
	);
}
