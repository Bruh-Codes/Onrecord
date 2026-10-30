import Link from "next/link";
import { ChevronRightIcon, GoogleSheetsLogo, UploadIcon } from "@/components/icons";

export function GetStartedCard({ hasData = false, googleSheets }: { hasData?: boolean; googleSheets?: React.ReactNode }) {
	return (
		<div className="bg-muted rounded-3xl p-5 sm:p-8 mb-7.5">
			<h2 className="text-2xl m-0 mb-1.5">
				{hasData ? "Add more records" : "Add your first records"}
			</h2>
			<p className="text-[13.5px] opacity-70 m-0 mb-6">
				{hasData
					? "The more months your records cover, the stronger your loan file."
					: "A MoMo or bank statement covering your last 6 to 12 months is the best place to start."}
			</p>
			<div className="flex gap-5 flex-wrap">
				<Link
					href="/documents"
					className="flex-1 min-w-[240px] bg-card rounded-2xl p-5 flex items-center gap-3.5"
				>
					<div className="w-[42px] h-[42px] shrink-0 rounded-xl bg-positive-background flex items-center justify-center">
						<UploadIcon className="text-positive" />
					</div>
					<div className="flex-1 min-w-0">
						<div className="text-[14.5px] font-semibold mb-0.5">
							{hasData ? "Upload records" : "Upload a statement"}
						</div>
						<div className="text-xs opacity-60">
							MoMo or bank statement, receipt, invoice, or a photo of your record book
						</div>
					</div>
					<ChevronRightIcon className="opacity-40 shrink-0" />
				</Link>
				{googleSheets && (
					<div className="flex-1 min-w-[240px] bg-card rounded-2xl p-5">
						<div className="flex items-center gap-3.5 mb-4">
							<div className="w-[42px] h-[42px] shrink-0 rounded-xl bg-[#e3f3e9] flex items-center justify-center">
								<GoogleSheetsLogo />
							</div>
							<div>
								<div className="text-[14.5px] font-semibold mb-0.5">Google Sheets</div>
								<div className="text-xs opacity-60">Import a bookkeeping sheet</div>
							</div>
						</div>
						{googleSheets}
					</div>
				)}
			</div>
		</div>
	);
}
