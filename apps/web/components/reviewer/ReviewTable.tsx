import { Badge } from "@/components/ui/Badge";
import type { ReviewItem } from "@/lib/types";

const STATUS_TONE = {
  Approved: "positive",
  Flagged: "negative",
  Open: "neutral",
} as const;

export function ReviewTable({
  items,
  selectedId,
  onSelect,
}: {
  items: ReviewItem[];
  selectedId: number;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="bg-panel rounded-[20px] overflow-hidden">
      <table className="w-full border-collapse text-[13.5px]">
        <thead>
          <tr>
            {["Document", "Field", "Confidence", "Status"].map((h) => (
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
          {items.map((item) => (
            <tr
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`cursor-pointer ${selectedId === item.id ? "bg-[#f2f2f0]" : ""}`}
            >
              <td className="px-4 py-3 border-b border-ink/8">{item.doc}</td>
              <td className="px-4 py-3 border-b border-ink/8 opacity-75">{item.field}</td>
              <td className="px-4 py-3 border-b border-ink/8">{item.confidencePct}%</td>
              <td className="px-4 py-3 border-b border-ink/8">
                <Badge tone={STATUS_TONE[item.status]}>{item.status}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
