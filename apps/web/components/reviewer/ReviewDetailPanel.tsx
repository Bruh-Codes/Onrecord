import { PillButton } from "@/components/ui/PillButton";
import type { ReviewItem } from "@/lib/types";

export function ReviewDetailPanel({
	item,
	onApprove,
	onFlag,
}: {
	item: ReviewItem;
	onApprove: () => void;
	onFlag: () => void;
}) {
	return (
		<div className="bg-white rounded-[20px] p-5 shadow-[0_3px_10px_rgba(20,20,20,0.1)]">
			<div className="text-[11px] tracking-wider uppercase text-ink/55 mb-2.5">
				Selected item
			</div>
			<div className="h-[150px] rounded-2xl mb-4 bg-[repeating-linear-gradient(135deg,#ececea,#ececea_10px,#e2e2e0_10px,#e2e2e0_20px)] flex items-center justify-center text-[11px] font-mono text-ink/50">
				document crop placeholder
			</div>
			<div className="text-[13px] font-semibold mb-0.5">{item.doc}</div>
			<div className="text-xs opacity-65 mb-3.5">{item.note}</div>
			<div className="text-[11px] text-ink/55 mb-1">
				Extracted field-{item.field}
			</div>
			<div className="font-[family-name:var(--font-display)] text-xl mb-3">
				{item.value}
			</div>
			<div className="flex justify-between text-[11.5px] mb-1">
				<span>Confidence</span>
				<span>{item.confidencePct}%</span>
			</div>
			<div className="h-1.5 rounded-full bg-[#dddddb] overflow-hidden mb-4.5">
				<div
					className="h-full rounded-full bg-ink"
					style={{ width: `${item.confidencePct}%` }}
				/>
			</div>
			<div className="flex gap-2">
				<PillButton variant="success" className="flex-1" onClick={onApprove}>
					Approve
				</PillButton>
				<PillButton variant="danger" className="flex-1" onClick={onFlag}>
					Flag suspect
				</PillButton>
			</div>
		</div>
	);
}
