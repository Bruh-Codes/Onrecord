import { Badge } from "@/components/ui/Badge";
import { formatGhs } from "@/lib/format";
import type { TransactionReviewItem } from "@/lib/api-types";

export function ReviewTable({
  items,
  selectedId,
  onSelect,
}: {
	items: TransactionReviewItem[];
	selectedId: string | null;
	onSelect: (id: string) => void;
}) {
  return (
    <div className="bg-panel rounded-[20px] overflow-hidden">
      <table className="w-full border-collapse text-[13.5px]">
        <thead>
          <tr>
				{["Transaction", "Source", "Amount", "AI suggestion"].map((h) => (
              <th
                key={h}
                className="text-left text-[10.5px] tracking-wider uppercase text-ink/55 px-4 py-3 border-b border-ink/16"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
			{items.map((item) => {
				const suggestion = item.ai_suggestion;
				return (
					<tr key={item.id} onClick={() => onSelect(item.id)} className={`cursor-pointer ${selectedId === item.id ? "bg-panel-strong" : ""}`}>
						<td className="px-4 py-3 border-b border-ink/8">
							<div className="font-medium">{item.counterparty_raw || "Unidentified transaction"}</div>
							<div className="text-xs text-ink/55">{item.occurred_on} · {item.direction === "in" ? "Inflow" : "Outflow"}</div>
						</td>
						<td className="px-4 py-3 border-b border-ink/8 text-xs text-ink/65">{item.document_filename}</td>
						<td className="px-4 py-3 border-b border-ink/8 font-semibold">{formatGhs(item.amount_pesewas)}</td>
						<td className="px-4 py-3 border-b border-ink/8">
							{suggestion ? <Badge tone={suggestion.confidence >= 0.6 ? "positive" : "neutral"}>{suggestion.category_l1.replaceAll("_", " ")} · {Math.round(suggestion.confidence * 100)}%</Badge> : <span className="text-xs text-ink/50">No confident suggestion</span>}
						</td>
					</tr>
				);
			})}
        </tbody>
      </table>
    </div>
  );
}
