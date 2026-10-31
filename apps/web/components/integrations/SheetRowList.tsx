"use client";

import { useToast } from "@/components/ui/Toast";
import { formatGhs } from "@/lib/format";
import { ACTION_TEXT, REASON_TEXT, sheetApi, timeAgo, useSheetMutation, type SheetRecord, type SheetRow, type SheetRowAction } from "@/lib/sheet-sync";

function describe(record: Partial<SheetRecord> | null | undefined, values?: string[]): string {
	if (!record || record.amount_pesewas == null) return values?.filter(Boolean).join(" · ") || "Empty row";
	const sign = record.direction === "in" ? "Money in" : "Money out";
	return `${record.occurred_on} · ${record.description ?? record.category_text ?? "No details"} · ${sign} ${formatGhs(record.amount_pesewas)}`;
}

const EVENT_TEXT: Record<string, string> = {
	edited_in_sheet: "Edited in the sheet",
	removed_from_sheet: "Deleted from the sheet",
	back_in_sheet: "Back in the sheet",
	owner_review: "You chose",
	removed_from_ledger: "Taken out of totals",
};

/** Rows waiting for the owner, or rows whose history shows they changed. */
export function SheetRowList({ title, empty, rows, withActions = false }: { title: string; empty: string; rows: SheetRow[]; withActions?: boolean }) {
	return (
		<section className="mb-8">
			<h2 className="m-0 mb-3 text-[16px] font-semibold">{title}</h2>
			{rows.length === 0 ? (
				<p className="m-0 text-[13px] opacity-65">{empty}</p>
			) : (
				<ul className="m-0 flex list-none flex-col gap-2.5 p-0">
					{rows.map((row) => <RowItem key={row.id} row={row} withActions={withActions} />)}
				</ul>
			)}
		</section>
	);
}

function RowItem({ row, withActions }: { row: SheetRow; withActions: boolean }) {
	const { toast } = useToast();
	const resolve = useSheetMutation((action: SheetRowAction) => sheetApi.review(row.id, action));
	const lastEdit = [...row.history].reverse().find((event) => event.event === "edited_in_sheet");

	async function choose(next: SheetRowAction) {
		try {
			await resolve.mutateAsync(next);
			toast({ title: "Saved", tone: "success" });
		} catch (problem) {
			toast({ title: problem instanceof Error ? problem.message : "Couldn't save that. Try again.", tone: "error" });
		}
	}

	return (
		<li className="rounded-xl border border-border p-3.5">
			<div className="text-[13px] font-semibold">
				Row {row.row_number}: {describe(row.parsed, row.values)}
			</div>
			{lastEdit?.before ? <div className="mt-0.5 text-[12.5px] opacity-70">Before: {describe(lastEdit.before)}</div> : null}
			{withActions && row.review_reason ? (
				<>
					<p className="m-0 mt-1.5 text-[12.5px] opacity-75">{REASON_TEXT[row.review_reason]}</p>
					<div className="mt-2.5 flex flex-wrap gap-2">
						{row.actions.map((next, index) => (
							<button
								key={next}
								type="button"
								disabled={resolve.isPending}
								onClick={() => void choose(next)}
								className={`rounded-full px-3.5 py-1.5 text-[12.5px] disabled:opacity-40 ${index === 0 ? "bg-foreground text-background" : "border border-foreground/20"}`}
							>
								{ACTION_TEXT[next]}
							</button>
						))}
					</div>
				</>
			) : (
				<ul className="m-0 mt-1.5 flex list-none flex-col gap-0.5 p-0 text-[12px] opacity-65">
					{row.history.map((event, index) => (
						<li key={index}>
							{EVENT_TEXT[event.event] ?? event.event}
							{event.action ? `: ${ACTION_TEXT[event.action].toLowerCase()}` : ""} · {timeAgo(event.at)}
						</li>
					))}
				</ul>
			)}
		</li>
	);
}
