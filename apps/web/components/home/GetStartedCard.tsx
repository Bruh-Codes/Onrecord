import Link from "next/link";
import { ChevronRightIcon, UploadIcon } from "@/components/icons";

export function GetStartedCard() {
	return (
		<div className="bg-panel rounded-3xl p-5 sm:p-8 mb-7.5">
			<h2 className="text-2xl m-0 mb-1.5">Get started with Onrecord</h2>
			<p className="text-[13.5px] opacity-70 m-0 mb-6">
				Upload one real document to start building your record.
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
							Upload your first statement or ledger
						</div>
						<div className="text-xs opacity-60">
							Bank, MoMo, sales export, receipt, or ledger photo
						</div>
					</div>
					<ChevronRightIcon className="opacity-40 shrink-0" />
				</Link>
			</div>
		</div>
	);
}
