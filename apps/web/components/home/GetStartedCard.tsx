import Link from "next/link";
import {
	ChevronRightIcon,
	CounterpartiesIcon,
	UploadIcon,
} from "@/components/icons";

export function GetStartedCard() {
	return (
		<div className="bg-panel rounded-3xl p-8 mb-7.5">
			<h2 className="text-2xl m-0 mb-1.5">Get started with Onrecord</h2>
			<p className="text-[13.5px] opacity-70 m-0 mb-6">
				Two quick wins to strengthen your profile right away.
			</p>
			<div className="flex gap-5 flex-wrap">
				<Link
					href="/documents"
					className="flex-1 min-w-[240px] bg-surface rounded-2xl p-5 flex items-center gap-3.5"
				>
					<div className="w-[42px] h-[42px] shrink-0 rounded-xl bg-positive-bg flex items-center justify-center">
						<UploadIcon className="text-positive" />
					</div>
					<div className="flex-1 min-w-0">
						<div className="text-[14.5px] font-semibold mb-0.5">
							Upload the missing MoMo window
						</div>
						<div className="text-xs opacity-60">
							3 Feb – 3 May · closes your biggest coverage gap
						</div>
					</div>
					<ChevronRightIcon className="opacity-40 shrink-0" />
				</Link>
				<Link
					href="/counterparties"
					className="flex-1 min-w-[240px] bg-surface rounded-2xl p-5 flex items-center gap-3.5"
				>
					<div className="w-[42px] h-[42px] shrink-0 rounded-xl bg-negative-bg flex items-center justify-center">
						<CounterpartiesIcon className="text-negative" />
					</div>
					<div className="flex-1 min-w-0">
						<div className="text-[14.5px] font-semibold mb-0.5">
							Classify Adom Ventures
						</div>
						<div className="text-xs opacity-60">
							Clears 34 unclassified transactions at once
						</div>
					</div>
					<ChevronRightIcon className="opacity-40 shrink-0" />
				</Link>
			</div>
		</div>
	);
}
