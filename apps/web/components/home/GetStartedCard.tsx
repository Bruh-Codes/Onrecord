import Link from "next/link";
import { ChevronRightIcon, GoogleSheetsLogo, UploadIcon } from "@/components/icons";

const STEPS = [
	{ title: "Add your records", body: "MoMo or bank statements, receipts, or cash sales." },
	{ title: "See how your business is doing", body: "Money in and out each month, worked out for you." },
	{ title: "Share it with a lender", body: "Print or send your Lender summary." },
];

/**
 * Home's "add records" card. A new owner sees how OnRecord works in 3 steps
 * and every way to start: upload right here, paste MoMo SMS (inside the
 * upload box), type in a cash sale, or connect a Google Sheet.
 */
export function GetStartedCard({
	hasData = false,
	upload,
	googleSheets,
}: {
	hasData?: boolean;
	upload?: React.ReactNode;
	googleSheets?: React.ReactNode;
}) {
	if (hasData) {
		return (
			<div className="bg-muted rounded-3xl p-5 sm:p-8 mb-7.5">
				<h2 className="text-2xl m-0 mb-1.5">Add more records</h2>
				<p className="text-[13.5px] opacity-70 m-0 mb-6">
					More months make your record stronger.
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
							<div className="text-[14.5px] font-semibold mb-0.5">Upload records</div>
							<div className="text-xs opacity-60">Statement, receipt or photo of your record book</div>
						</div>
						<ChevronRightIcon className="opacity-40 shrink-0" />
					</Link>
					{googleSheets && <SheetsCard>{googleSheets}</SheetsCard>}
				</div>
			</div>
		);
	}

	return (
		<div className="bg-muted rounded-3xl p-5 sm:p-8 mb-7.5">
			<h2 className="text-xl sm:text-2xl m-0 mb-3 sm:mb-4">How OnRecord works</h2>
			<ol className="m-0 mb-5 grid list-none gap-2 p-0 sm:grid-cols-3 sm:gap-3">
				{STEPS.map((step, index) => (
					<li key={step.title} className="flex gap-3 rounded-2xl bg-card p-3 sm:p-4">
						<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-[12px] text-background tabular-nums">
							{index + 1}
						</span>
						<div>
							<div className="text-[14px] font-semibold">{step.title}</div>
							<div className="mt-0.5 text-[12.5px] text-foreground/65">{step.body}</div>
						</div>
					</li>
				))}
			</ol>
			<h3 className="m-0 mb-1 text-[15px] font-semibold font-[family-name:var(--body-font)]">Start here</h3>
			<p className="m-0 mb-3 text-[13px] text-foreground/65">
				A MoMo or bank statement for your last 6 to 12 months works best.
			</p>
			{upload}
			<div className="mt-4 flex flex-wrap gap-2">
				<Link
					href="/money?add=1"
					className="rounded-full border border-foreground/20 bg-card px-4 py-2 text-[13px] text-foreground no-underline"
				>
					Type in a cash sale or cost
				</Link>
				<Link
					href="/apps"
					className="rounded-full border border-foreground/20 bg-card px-4 py-2 text-[13px] text-foreground no-underline"
				>
					Connect a Google Sheet
				</Link>
			</div>
		</div>
	);
}

function SheetsCard({ children }: { children: React.ReactNode }) {
	return (
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
			{children}
		</div>
	);
}
