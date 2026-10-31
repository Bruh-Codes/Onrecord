"use client";

import { useEffect, useState } from "react";
import { formatGhs } from "@/lib/format";
import { SHEET_FIELDS, sheetApi, useSheetMutation, type SheetField, type SheetMapping, type SheetPreview } from "@/lib/sheet-sync";

const FIELD = "w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px]";

/** OnRecord's guess at what each column means, which the owner confirms once. */
export function SheetColumnSetup({ connectionId, onDone, onCancel }: { connectionId: string; onDone: () => void; onCancel?: () => void }) {
	const [mapping, setMapping] = useState<SheetMapping | null>(null);
	const [preview, setPreview] = useState<SheetPreview | null>(null);
	const [error, setError] = useState("");
	const confirm = useSheetMutation(() => sheetApi.confirm(connectionId, mapping!));

	useEffect(() => {
		let cancelled = false;
		const timer = window.setTimeout(() => {
			sheetApi.preview(connectionId, mapping ?? undefined)
				.then((next) => {
					if (cancelled) return;
					setPreview(next);
					if (!mapping) setMapping(next.mapping);
					setError("");
				})
				.catch((problem: Error) => !cancelled && setError(problem.message));
		}, mapping ? 400 : 0);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, [connectionId, mapping]);

	if (!mapping || !preview) {
		return error ? <p className="text-[13px] text-destructive">{error}</p> : <p className="text-[13px] opacity-60">Reading your sheet...</p>;
	}

	const columnLabel = (index: number) => {
		const name = preview.header[index];
		return `Column ${preview.columns[index]}${name ? ` · ${name}` : ""}`;
	};
	const setColumn = (field: SheetField, value: string) =>
		setMapping({ ...mapping, columns: { ...mapping.columns, [field]: value === "" ? null : Number(value) } });
	const singleAmount = mapping.columns.amount != null;

	async function save() {
		setError("");
		try {
			await confirm.mutateAsync();
			onDone();
		} catch (problem) {
			setError(problem instanceof Error ? problem.message : "Could not save the column setup.");
		}
	}

	return (
		<div className="flex flex-col gap-5">
			<div>
				<h2 className="m-0 text-[16px] font-semibold">Check the columns</h2>
				<p className="m-0 mt-1 text-[12.5px] opacity-70">
					OnRecord guessed what each column means. Fix anything that&apos;s wrong, check the preview, then confirm. You only do this once.
				</p>
			</div>

			<div className="grid gap-3 sm:grid-cols-2">
				{SHEET_FIELDS.map((field) => (
					<label key={field.key} className="grid gap-1 text-[12.5px] font-semibold">
						{field.label}
						<select value={mapping.columns[field.key] ?? ""} onChange={(event) => setColumn(field.key, event.target.value)} className={FIELD}>
							<option value="">{"required" in field ? "Choose a column" : "Not in my sheet"}</option>
							{preview.columns.map((_, index) => <option key={index} value={index}>{columnLabel(index)}</option>)}
						</select>
					</label>
				))}
				<label className="grid gap-1 text-[12.5px] font-semibold">
					Column names are in row
					<input
						type="number" min={0} max={50} value={mapping.header_row}
						onChange={(event) => setMapping({ ...mapping, header_row: Math.max(0, Number(event.target.value) || 0) })}
						className={FIELD}
					/>
				</label>
				<label className="grid gap-1 text-[12.5px] font-semibold">
					Dates are written
					<select value={mapping.date_order} onChange={(event) => setMapping({ ...mapping, date_order: event.target.value as "dmy" | "mdy" })} className={FIELD}>
						<option value="dmy">Day first (31/10/2026)</option>
						<option value="mdy">Month first (10/31/2026)</option>
					</select>
				</label>
				{singleAmount && mapping.columns.direction == null ? (
					<label className="grid gap-1 text-[12.5px] font-semibold sm:col-span-2">
						Every row in this tab is
						<select
							value={mapping.default_direction ?? ""}
							onChange={(event) => setMapping({ ...mapping, default_direction: (event.target.value || null) as "in" | "out" | null })}
							className={FIELD}
						>
							<option value="">Mixed: minus amounts are money out</option>
							<option value="in">Money in (for example a sales tab)</option>
							<option value="out">Money out (for example an expenses tab)</option>
						</select>
					</label>
				) : null}
			</div>

			<div>
				<h3 className="m-0 mb-2 text-[13.5px] font-semibold">How OnRecord will read your first rows ({preview.data_rows} rows found)</h3>
				<div className="overflow-x-auto rounded-xl border border-border">
					<table className="w-full text-left text-[12.5px]">
						<thead className="bg-muted/50">
							<tr>
								<th className="px-3 py-2 font-semibold">Row</th>
								<th className="px-3 py-2 font-semibold">Date</th>
								<th className="px-3 py-2 font-semibold">Details</th>
								<th className="px-3 py-2 text-right font-semibold">Money in</th>
								<th className="px-3 py-2 text-right font-semibold">Money out</th>
							</tr>
						</thead>
						<tbody>
							{preview.rows.map((row) => (
								<tr key={row.row_number} className="border-t border-border">
									<td className="px-3 py-2 opacity-60">{row.row_number}</td>
									{row.record ? (
										<>
											<td className="px-3 py-2 whitespace-nowrap">{row.record.occurred_on}</td>
											<td className="px-3 py-2">{row.record.description ?? row.record.category_text ?? "-"}</td>
											<td className="px-3 py-2 text-right">{row.record.direction === "in" ? formatGhs(row.record.amount_pesewas) : ""}</td>
											<td className="px-3 py-2 text-right">{row.record.direction === "out" ? formatGhs(row.record.amount_pesewas) : ""}</td>
										</>
									) : (
										<td colSpan={4} className="px-3 py-2 text-destructive">{row.issues.join(" ")}</td>
									)}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>

			{preview.problems.length || error ? (
				<ul className="m-0 flex list-none flex-col gap-1 p-0 text-[12.5px] text-destructive">
					{[...preview.problems, ...(error ? [error] : [])].map((problem) => <li key={problem}>{problem}</li>)}
				</ul>
			) : null}

			<div className="flex flex-wrap gap-3">
				<button
					type="button"
					disabled={preview.problems.length > 0 || confirm.isPending}
					onClick={() => void save()}
					className="rounded-full bg-foreground px-5 py-2.5 text-[13.5px] text-background disabled:cursor-not-allowed disabled:opacity-40"
				>
					{confirm.isPending ? "Saving..." : "Looks right, start syncing"}
				</button>
				{onCancel ? <button type="button" onClick={onCancel} className="text-[13px] underline underline-offset-2">Cancel</button> : null}
			</div>
		</div>
	);
}
