"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { PillButton } from "@/components/ui/PillButton";
import { ApiError } from "@/lib/api";
import {
	CATEGORY_LABELS,
	type ExtractedRow,
	type Reconciliation,
	type RowDecision,
	useConfirmRows,
	useExtractedRows,
} from "@/lib/document-review";
import { formatGhs } from "@/lib/format";

type Edit = { include: boolean; direction: "in" | "out"; amount: string; category: string };

const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** "1,250.5" → 125050 without floating-point arithmetic. */
export function cedisToPesewas(text: string): number | null {
	const cleaned = text.replace(/[,\s]/g, "").replace(/^GH[¢S]?/i, "");
	const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
	if (!match) return null;
	return Number(match[1]) * 100 + Number((match[2] ?? "0").padEnd(2, "0"));
}

function pesewasToInput(pesewas: number): string {
	const cedis = Math.floor(pesewas / 100);
	const rest = pesewas % 100;
	return rest ? `${cedis}.${String(rest).padStart(2, "0")}` : String(cedis);
}

function initialEdit(row: ExtractedRow): Edit {
	return { include: !row.excluded, direction: row.direction, amount: pesewasToInput(row.amount_pesewas), category: row.category_l1 };
}

export function ExtractedRowsReview({ documentId, businessId }: { documentId: string; businessId: string | null }) {
	const query = useExtractedRows(documentId);
	const confirm = useConfirmRows(businessId);
	const [edits, setEdits] = useState<Record<string, Edit>>({});
	const [error, setError] = useState<string | null>(null);
	const [saved, setSaved] = useState<{ created: number; duplicates: number } | null>(null);
	const data = query.data;
	const editable = data?.state === "needs_review";

	const current = useMemo(
		() => (data?.rows ?? []).map((row) => ({ row, edit: edits[row.id] ?? initialEdit(row) })),
		[data, edits],
	);
	const totals = useMemo(() => {
		let moneyIn = 0;
		let moneyOut = 0;
		let included = 0;
		for (const { edit } of current) {
			if (!edit.include) continue;
			const amount = cedisToPesewas(edit.amount) ?? 0;
			included += 1;
			if (edit.direction === "in") moneyIn += amount;
			else moneyOut += amount;
		}
		return { moneyIn, moneyOut, included };
	}, [current]);
	const invalid = current.some(({ edit }) => edit.include && !cedisToPesewas(edit.amount));

	if (query.isLoading) return <div className="px-1 pb-4 text-[12.5px] text-foreground/60">Loading the rows we read…</div>;
	if (query.isError || !data) {
		return <div className="px-1 pb-4 text-[12.5px] text-destructive">Couldn&apos;t load the rows for this document.</div>;
	}

	function update(id: string, row: ExtractedRow, patch: Partial<Edit>) {
		setEdits((prev) => ({ ...prev, [id]: { ...(prev[id] ?? initialEdit(row)), ...patch } }));
	}

	async function submit() {
		setError(null);
		setSaved(null);
		const decisions: RowDecision[] = [];
		for (const { row, edit } of current) {
			const decision: RowDecision = { id: row.id };
			const amount = cedisToPesewas(edit.amount);
			if (edit.include !== !row.excluded) decision.include = edit.include;
			if (edit.direction !== row.direction) decision.direction = edit.direction;
			if (amount && amount !== row.amount_pesewas) decision.amount_pesewas = amount;
			if (edit.category !== row.category_l1) decision.category_l1 = edit.category;
			if (Object.keys(decision).length > 1) decisions.push(decision);
		}
		try {
			const result = await confirm.mutateAsync({ documentId, rows: decisions });
			setEdits({});
			setSaved({ created: result.transactions_created, duplicates: result.duplicates_skipped });
		} catch (err) {
			if (err instanceof ApiError && err.status < 500) setError(err.message);
			else setError("We couldn't save these rows: the server hit an error. Nothing was saved, so you can try again in a minute.");
		}
	}

	return (
		<div className="mb-4 rounded-2xl border border-border bg-card p-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					<p className="m-0 text-[13.5px] font-semibold">{data.summary || "Rows read from this document"}</p>
					<p className="m-0 mt-1 text-[12.5px] text-foreground/60">
						{editable
							? "Check the rows below. Untick anything that isn't a real transaction, fix amounts if needed, then confirm."
							: "These rows are in your records."}
					</p>
				</div>
				{data.reconciliation && <ReconciliationPill reconciliation={data.reconciliation} />}
			</div>
			{data.findings.length > 0 && (
				<ul className="m-0 mt-3 list-disc space-y-1 pl-5 text-[12px] text-foreground/65">
					{data.findings.slice(0, 5).map((finding) => <li key={finding}>{finding}</li>)}
				</ul>
			)}

			<div className="mt-3 -mx-4 overflow-x-auto">
				<table className="w-full min-w-[640px] border-collapse text-[12.5px]">
					<thead>
						<tr className="text-left text-[11px] uppercase tracking-wider text-foreground/45">
							<th className="w-10 py-2 pl-4 font-normal"><span className="sr-only">Include</span></th>
							<th className="py-2 pr-3 font-normal">Date</th>
							<th className="py-2 pr-3 font-normal">Details</th>
							<th className="py-2 pr-3 font-normal">Category</th>
							<th className="py-2 pr-3 font-normal">In / out</th>
							<th className="py-2 pr-3 text-right font-normal">Amount (GH¢)</th>
							<th className="py-2 pr-4 text-right font-normal">Balance</th>
						</tr>
					</thead>
					<tbody>
						{current.map(({ row, edit }) => (
							<tr key={row.id} className={`border-t border-border align-top ${edit.include ? "" : "opacity-45"}`}>
								<td className="py-2 pl-4">
									<input
										type="checkbox"
										aria-label={`Include ${row.description}`}
										checked={edit.include}
										disabled={!editable}
										onChange={(event) => update(row.id, row, { include: event.target.checked })}
										className="h-4 w-4 accent-[var(--primary)]"
									/>
								</td>
								<td className="whitespace-nowrap py-2 pr-3">{dateFormatter.format(new Date(row.occurred_on))}</td>
								<td className="py-2 pr-3">
									<div className={edit.include ? "" : "line-through"}>{row.description || "—"}</div>
									{row.counterparty && <div className="text-[11.5px] text-foreground/55">{row.counterparty}</div>}
									{row.fee_pesewas + row.levy_pesewas > 0 && (
										<div className="text-[11.5px] text-foreground/55">
											Fees {formatGhs(row.fee_pesewas + row.levy_pesewas)}
										</div>
									)}
								</td>
								<td className="py-2 pr-3">
									<select
										aria-label="Category"
										value={edit.category}
										disabled={!editable}
										onChange={(event) => update(row.id, row, { category: event.target.value })}
										className="rounded-lg border border-border bg-transparent px-2 py-1 text-[12.5px]"
									>
										{Object.entries(CATEGORY_LABELS).map(([value, label]) => (
											<option key={value} value={value}>{label}</option>
										))}
									</select>
								</td>
								<td className="py-2 pr-3">
									<button
										type="button"
										disabled={!editable}
										onClick={() => update(row.id, row, { direction: edit.direction === "in" ? "out" : "in" })}
										className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${edit.direction === "in" ? "bg-positive-background text-positive" : "bg-accent text-foreground/80"}`}
									>
										{edit.direction === "in" ? "Money in" : "Money out"}
									</button>
								</td>
								<td className="py-2 pr-3 text-right">
									<input
										inputMode="decimal"
										aria-label="Amount in cedis"
										value={edit.amount}
										disabled={!editable}
										onChange={(event) => update(row.id, row, { amount: event.target.value })}
										className={`w-24 rounded-lg border bg-transparent px-2 py-1 text-right tabular-nums ${edit.include && !cedisToPesewas(edit.amount) ? "border-destructive" : "border-border"} disabled:border-transparent`}
									/>
								</td>
								<td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums text-foreground/60">
									{row.balance_after_pesewas == null ? "—" : formatGhs(row.balance_after_pesewas)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
				<div className="text-[12.5px] text-foreground/65">
					{totals.included} rows · <span className="text-positive">in {formatGhs(totals.moneyIn)}</span> · out {formatGhs(totals.moneyOut)}
				</div>
				{editable && (
					<PillButton onClick={submit} disabled={confirm.isPending || invalid}>
						{confirm.isPending ? "Saving…" : `Confirm ${totals.included} rows`}
					</PillButton>
				)}
			</div>
			{error && (
				<p role="alert" className="m-0 mt-3 rounded-xl bg-destructive-background px-3 py-2 text-[12.5px] text-destructive">
					{error}
				</p>
			)}
			{saved && (
				<p role="status" className="m-0 mt-3 rounded-xl bg-positive-background px-3 py-2 text-[12.5px] text-positive">
					Saved {saved.created} {saved.created === 1 ? "row" : "rows"} to your records
					{saved.duplicates > 0 && ` (${saved.duplicates} already there, skipped)`}.{" "}
					<Link href="/money" className="font-semibold underline underline-offset-2">See them in Money</Link>
				</p>
			)}
		</div>
	);
}

function ReconciliationPill({ reconciliation }: { reconciliation: Reconciliation }) {
	const tone =
		reconciliation.status === "reconciled"
			? "bg-positive-background text-positive"
			: reconciliation.status === "balance_breaks"
				? "bg-destructive-background text-destructive"
				: "bg-accent text-foreground/75";
	const label =
		reconciliation.status === "reconciled"
			? "Balances add up"
			: reconciliation.status === "balance_breaks"
				? "Balances don't add up"
				: "No balances to check";
	return (
		<span title={reconciliation.note} className={`shrink-0 rounded-xl px-3 py-1 text-[11.5px] font-semibold ${tone}`}>
			{label}
		</span>
	);
}
