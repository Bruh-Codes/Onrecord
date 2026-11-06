"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { formatGhs } from "@/lib/format";
import {
	SHEET_FIELDS,
	sheetApi,
	useSheetMutation,
	type SheetConnection,
	type SheetField,
	type SheetMapping,
	type SheetPreview,
} from "@/lib/sheet-sync";

const FIELD = "w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px]";
const NO_DATES = "no-dates";
const ESSENTIAL: SheetField[] = ["date", "description", "amount", "money_in", "money_out", "direction"];
const EXTRA_FIELDS = SHEET_FIELDS.filter((field) => !ESSENTIAL.includes(field.key));

function dateText(iso: string) {
	return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** An API that hasn't been updated yet sends the older, smaller preview. Fill the
 *  newer fields from what it does send so the page still works during a deploy. */
function withDefaults(preview: SheetPreview): SheetPreview {
	const records = (preview.rows ?? []).map((row) => row.record).filter((record) => record !== null);
	const sum = (direction: "in" | "out") =>
		records.filter((record) => record.direction === direction).reduce((total, record) => total + record.amount_pesewas, 0);
	const dates = records.map((record) => record.occurred_on).sort();
	return {
		...preview,
		rows: preview.rows ?? [],
		problems: preview.problems ?? [],
		field_problems: preview.field_problems ?? (preview.problems ?? []).map((message) => ({ field: "columns", message })),
		notes: preview.notes ?? [],
		readable_rows: preview.readable_rows ?? records.length,
		money_in_pesewas: preview.money_in_pesewas ?? sum("in"),
		money_out_pesewas: preview.money_out_pesewas ?? sum("out"),
		first_date: preview.first_date ?? dates[0] ?? null,
		last_date: preview.last_date ?? dates[dates.length - 1] ?? null,
	};
}

/** Two or three choices shown side by side, like a segmented switch. */
function Choice<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (next: T) => void }) {
	return (
		<div className="inline-flex flex-wrap gap-1 rounded-full border border-border p-1">
			{options.map(([key, label]) => (
				<button
					key={key}
					type="button"
					onClick={() => onChange(key)}
					className={`rounded-full px-3 py-1.5 text-[12.5px] ${value === key ? "bg-foreground text-background" : "opacity-75 hover:opacity-100"}`}
				>
					{label}
				</button>
			))}
		</div>
	);
}

/** One question about the sheet, with any problem shown right under it. */
function Question({ label, hint, problem, note, children }: { label: string; hint?: string; problem?: string; note?: string; children: ReactNode }) {
	return (
		<div className="grid gap-2 py-4 sm:grid-cols-[180px_1fr] sm:gap-4">
			<div>
				<div className="text-[13px] font-semibold">{label}</div>
				{hint ? <div className="text-[12px] opacity-60">{hint}</div> : null}
			</div>
			<div className="grid min-w-0 gap-2">
				{children}
				{problem ? <p className="m-0 text-[12.5px] text-destructive">{problem}</p> : null}
				{!problem && note ? <p className="m-0 text-[12.5px] text-destructive">{note}</p> : null}
			</div>
		</div>
	);
}

/** OnRecord reads the sheet as it is and shows what it found; the owner confirms once. */
export function SheetColumnSetup({
	connectionId,
	sheet,
	onDone,
	onCancel,
}: {
	connectionId: string;
	sheet: Pick<SheetConnection, "sheet_gid" | "sheet_title" | "last_synced_at">;
	onDone: () => void;
	onCancel?: () => void;
}) {
	const [mapping, setMapping] = useState<SheetMapping | null>(null);
	const [preview, setPreview] = useState<SheetPreview | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [adjusting, setAdjusting] = useState(false);
	// OnRecord's guess is shown as a preview first; the column questions open only when asked for or needed.
	const [fixing, setFixing] = useState(Boolean(onCancel));
	const [noDates, setNoDates] = useState(false);
	// Kept apart from the mapping so "money in and out" stays chosen while its columns are still empty.
	const [chosenAmountMode, setChosenAmountMode] = useState<"one" | "split" | null>(null);
	const confirm = useSheetMutation(() => sheetApi.confirm(connectionId, mapping!));
	const changeTab = useSheetMutation((gid: number) => sheetApi.changeTab(connectionId, gid));
	const canChangeTab = !sheet.last_synced_at;
	const tabs = useQuery({ queryKey: ["sheet-tabs", connectionId], queryFn: () => sheetApi.tabs(connectionId), enabled: canChangeTab });

	useEffect(() => {
		let cancelled = false;
		const timer = window.setTimeout(() => {
			setLoading(true);
			sheetApi.preview(connectionId, mapping ?? undefined)
				.then((next) => {
					if (cancelled) return;
					setPreview(withDefaults(next));
					if (!mapping) {
						setMapping(next.mapping);
						setNoDates(next.mapping.columns.date == null && !!next.mapping.default_date);
					}
					setError("");
				})
				.catch((problem: Error) => !cancelled && setError(problem.message))
				.finally(() => !cancelled && setLoading(false));
		}, mapping ? 350 : 0);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, [connectionId, mapping]);

	async function pickTab(gid: number) {
		if (gid === sheet.sheet_gid || changeTab.isPending) return;
		setError("");
		try {
			await changeTab.mutateAsync(gid);
			// A new tab gets a fresh guess.
			setMapping(null);
			setPreview(null);
			setAdjusting(false);
			setFixing(Boolean(onCancel));
			setChosenAmountMode(null);
		} catch (problem) {
			setError(problem instanceof Error ? problem.message : "Could not switch to that tab.");
		}
	}

	const tabBar =
		canChangeTab && (tabs.data?.length ?? 0) > 1 ? (
			<div className="mb-5">
				<div className="mb-2 text-[12.5px] opacity-70">Which tab has your records?</div>
				<div className="flex flex-wrap gap-2">
					{tabs.data!.map((tab) => (
						<button
							key={tab.sheet_gid}
							type="button"
							disabled={changeTab.isPending}
							onClick={() => void pickTab(tab.sheet_gid)}
							className={`rounded-full border px-3.5 py-1.5 text-[13px] disabled:opacity-60 ${tab.sheet_gid === sheet.sheet_gid ? "border-foreground bg-foreground text-background" : "border-foreground/20"}`}
						>
							{tab.title}
						</button>
					))}
				</div>
			</div>
		) : !canChangeTab ? (
			<p className="m-0 mb-5 text-[12.5px] opacity-70">
				Reading the tab {sheet.sheet_title}. To read another tab too, <Link href="/apps/sheets/new" className="underline underline-offset-2">connect it as well</Link>.
			</p>
		) : null;

	if (!mapping || !preview) {
		return (
			<div>
				{tabBar}
				{error ? <p className="text-[13px] text-destructive">{error}</p> : <p className="text-[13px] opacity-60">{changeTab.isPending ? "Opening that tab..." : "Reading your sheet..."}</p>}
			</div>
		);
	}

	const problemFor = (...fields: string[]) => preview.field_problems.find((problem) => fields.includes(problem.field))?.message;
	const noteFor = (field: string) => preview.notes.find((note) => note.field === field)?.message;
	const columnLabel = (index: number) => {
		const name = preview.header[index];
		return `Column ${preview.columns[index]}${name ? ` · ${name}` : ""}`;
	};
	const update = (next: Partial<SheetMapping>) => setMapping({ ...mapping, ...next });
	const setColumn = (field: SheetField, value: string) =>
		update({ columns: { ...mapping.columns, [field]: value === "" ? null : Number(value) } });
	const columnSelect = (field: SheetField, empty = "Not in my sheet") => (
		<select value={mapping.columns[field] ?? ""} onChange={(event) => setColumn(field, event.target.value)} className={FIELD}>
			<option value="">{empty}</option>
			{preview.columns.map((_, index) => <option key={index} value={index}>{columnLabel(index)}</option>)}
		</select>
	);

	const split = mapping.columns.money_in != null || mapping.columns.money_out != null;
	const amountMode: "one" | "split" = chosenAmountMode ?? (split ? "split" : "one");
	const rowsAre: "out" | "in" | "mixed" = mapping.default_direction ?? "mixed";
	const dateNote = noteFor("date");
	const needsOneDate = noDates || !!dateNote || !!mapping.default_date;
	const blocked = preview.field_problems.length > 0 || preview.readable_rows === 0;
	const firstBlocker = preview.field_problems[0]?.message ?? preview.notes[0]?.message ?? "None of the rows can be read yet.";
	const unreadable = preview.data_rows - preview.readable_rows;
	const showQuestions = fixing || blocked;
	const shownRows = showQuestions ? preview.rows : preview.rows.slice(0, 5);
	const hasCategory = preview.rows.some((row) => row.record?.category_text);

	function setAmountMode(mode: "one" | "split") {
		if (mode === amountMode) return;
		setChosenAmountMode(mode);
		const columns = { ...mapping!.columns };
		if (mode === "one") {
			columns.amount = columns.amount ?? columns.money_out ?? columns.money_in ?? null;
			columns.money_in = null;
			columns.money_out = null;
		} else {
			columns.amount = null;
			columns.direction = null;
			if (mapping!.default_direction === "in") columns.money_in = mapping!.columns.amount ?? null;
			else columns.money_out = mapping!.columns.amount ?? null;
		}
		update({ columns, default_direction: mode === "split" ? null : mapping!.default_direction });
	}

	async function save() {
		setError("");
		try {
			await confirm.mutateAsync();
			onDone();
		} catch (problem) {
			setError(problem instanceof Error ? problem.message : "Could not save the column setup.");
		}
	}

	const total = preview.money_out_pesewas && preview.money_in_pesewas
		? `${formatGhs(preview.money_in_pesewas)} in and ${formatGhs(preview.money_out_pesewas)} out`
		: preview.money_out_pesewas
			? `${formatGhs(preview.money_out_pesewas)} money out`
			: `${formatGhs(preview.money_in_pesewas)} money in`;
	const kind = preview.money_in_pesewas && !preview.money_out_pesewas ? "sales" : preview.money_out_pesewas && !preview.money_in_pesewas ? "costs" : "records";

	return (
		<div className="flex flex-col">
			{tabBar}

			{/* What OnRecord found, in one sentence. */}
			<div className={`rounded-xl px-4 py-3.5 ${preview.readable_rows ? "bg-positive-background" : "bg-muted/60"}`}>
				{preview.readable_rows ? (
					<>
						<div className="text-[15px] font-semibold">
							OnRecord found {preview.readable_rows} {kind}, {total}
						</div>
						<div className="mt-0.5 text-[12.5px] opacity-75">
							{preview.first_date && preview.last_date
								? preview.first_date === preview.last_date
									? `All on ${dateText(preview.first_date)}. `
									: `From ${dateText(preview.first_date)} to ${dateText(preview.last_date)}. `
								: ""}
							{unreadable ? `${unreadable} more row${unreadable === 1 ? "" : "s"} need a fix.` : "Every row could be read."}
						</div>
					</>
				) : (
					<>
						<div className="text-[15px] font-semibold">OnRecord can&apos;t read these rows yet</div>
						<div className="mt-0.5 text-[12.5px] opacity-75">{preview.data_rows} rows found. Fix the question in red below.</div>
					</>
				)}
			</div>

			{showQuestions ? (
				<>
			{/* The few things a record needs. */}
			<div className="mt-2 divide-y divide-border">
				<Question label="Date" hint="When it happened" problem={problemFor("date")}>
					<select
						value={noDates ? NO_DATES : (mapping.columns.date ?? "")}
						onChange={(event) => {
							const value = event.target.value;
							setNoDates(value === NO_DATES);
							update({ columns: { ...mapping.columns, date: value === "" || value === NO_DATES ? null : Number(value) } });
						}}
						className={FIELD}
					>
						<option value="">Choose a column</option>
						{preview.columns.map((_, index) => <option key={index} value={index}>{columnLabel(index)}</option>)}
						<option value={NO_DATES}>My sheet has no dates</option>
					</select>
					{dateNote && !mapping.default_date ? <p className="m-0 text-[12.5px] text-destructive">{dateNote}</p> : null}
					{needsOneDate ? (
						<label className="grid gap-1 text-[12.5px]">
							<span className="opacity-75">{noDates ? "Use this date for every row" : "Use this date for rows with no date"}</span>
							<input
								type="date"
								value={mapping.default_date ?? ""}
								max={new Date().toISOString().slice(0, 10)}
								onChange={(event) => update({ default_date: event.target.value || null })}
								className={`${FIELD} max-w-[220px]`}
							/>
						</label>
					) : null}
				</Question>

				<Question label="Details" hint="What it was for">
					{columnSelect("description")}
				</Question>

				<Question label="Amount" problem={problemFor("amount", "money_in", "money_out")}>
					<Choice
						value={amountMode}
						options={[["one", "One amount column"], ["split", "Money in and out columns"]]}
						onChange={setAmountMode}
					/>
					{amountMode === "one" ? (
						columnSelect("amount", "Choose a column")
					) : (
						<div className="grid gap-2 sm:grid-cols-2">
							<label className="grid gap-1 text-[12px] opacity-90">Money in{columnSelect("money_in")}</label>
							<label className="grid gap-1 text-[12px] opacity-90">Money out{columnSelect("money_out")}</label>
						</div>
					)}
				</Question>

				{amountMode === "one" ? (
					<Question label="These rows are" problem={problemFor("direction")} note={noteFor("direction")}>
						<Choice
							value={rowsAre}
							options={[["out", "All money out"], ["in", "All money in"], ["mixed", "Some of each"]]}
							onChange={(next) => update({
								default_direction: next === "mixed" ? null : next,
								columns: next === "mixed" ? mapping.columns : { ...mapping.columns, direction: null },
							})}
						/>
						{rowsAre === "mixed" ? (
							<label className="grid gap-1 text-[12px] opacity-90">
								Column that says in or out (minus amounts always count as money out)
								{columnSelect("direction")}
							</label>
						) : null}
					</Question>
				) : null}
			</div>

			{/* Everything else is optional. */}
			<div className="border-t border-border pt-3">
				<button type="button" onClick={() => setAdjusting(!adjusting)} className="text-[13px] font-semibold underline underline-offset-2">
					{adjusting ? "Hide other columns" : "Adjust other columns (optional)"}
				</button>
				{adjusting ? (
					<div className="mt-3 grid gap-3 sm:grid-cols-2">
						{EXTRA_FIELDS.map((field) => (
							<label key={field.key} className="grid gap-1 text-[12.5px] font-semibold">
								{field.label}
								{columnSelect(field.key)}
								{problemFor(field.key) ? <span className="font-normal text-destructive">{problemFor(field.key)}</span> : null}
							</label>
						))}
						<label className="grid gap-1 text-[12.5px] font-semibold">
							Column names are in row
							<input
								type="number" min={0} max={50} value={mapping.header_row}
								onChange={(event) => update({ header_row: Math.max(0, Number(event.target.value) || 0) })}
								className={FIELD}
							/>
						</label>
						<label className="grid gap-1 text-[12.5px] font-semibold">
							Dates are written
							<select value={mapping.date_order} onChange={(event) => update({ date_order: event.target.value as "dmy" | "mdy" })} className={FIELD}>
								<option value="dmy">Day first (31/10/2026)</option>
								<option value="mdy">Month first (10/31/2026)</option>
							</select>
						</label>
					</div>
				) : null}
			</div>

				</>
			) : null}

			{/* Exactly what will be saved from the first rows. */}
			<div className={showQuestions ? "mt-6" : "mt-4"}>
				<h3 className="m-0 mb-2 text-[13.5px] font-semibold">
					How your rows will look {loading ? <span className="font-normal opacity-50">· updating…</span> : null}
				</h3>
				<div className="overflow-x-auto rounded-xl border border-border">
					<table className="w-full text-left text-[12.5px]">
						<thead className="bg-muted/50">
							<tr>
								<th className="px-3 py-2 font-semibold">Row</th>
								<th className="px-3 py-2 font-semibold">Date</th>
								<th className="px-3 py-2 font-semibold">Details</th>
								{hasCategory ? <th className="hidden px-3 py-2 font-semibold sm:table-cell">Category</th> : null}
								<th className="px-3 py-2 text-right font-semibold">Amount</th>
							</tr>
						</thead>
						<tbody>
							{shownRows.map((row) => (
								<tr key={row.row_number} className="border-t border-border">
									<td className="px-3 py-2 opacity-60">{row.row_number}</td>
									{row.record ? (
										<>
											<td className="px-3 py-2 whitespace-nowrap">{dateText(row.record.occurred_on)}</td>
											<td className="px-3 py-2">{row.record.description ?? "-"}</td>
											{hasCategory ? <td className="hidden px-3 py-2 opacity-75 sm:table-cell">{row.record.category_text ?? "-"}</td> : null}
											<td className={`px-3 py-2 text-right whitespace-nowrap ${row.record.direction === "in" ? "text-positive" : ""}`}>
												{row.record.direction === "in" ? "+" : "−"}{formatGhs(row.record.amount_pesewas)}
											</td>
										</>
									) : (
										<td colSpan={hasCategory ? 4 : 3} className="px-3 py-2">
											<span className="opacity-60">{row.values.filter(Boolean).slice(0, 3).join(" · ")}</span>
											<span className="block text-destructive">{row.issues.join(" ")}</span>
										</td>
									)}
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{preview.data_rows > shownRows.length ? (
					<p className="m-0 mt-1.5 text-[12px] opacity-60">First {shownRows.length} of {preview.data_rows} rows.</p>
				) : null}
			</div>

			{error ? <p className="m-0 mt-4 text-[12.5px] text-destructive">{error}</p> : null}
			<div className="mt-5 flex flex-wrap items-center gap-3">
				<button
					type="button"
					disabled={blocked || confirm.isPending || loading}
					onClick={() => void save()}
					className="rounded-full bg-foreground px-5 py-2.5 text-[13.5px] text-background disabled:cursor-not-allowed disabled:opacity-40"
				>
					{confirm.isPending ? "Saving…" : showQuestions ? "Save and start syncing" : "Looks right, start syncing"}
				</button>
				{!showQuestions ? (
					<button type="button" onClick={() => setFixing(true)} className="text-[13px] underline underline-offset-2">Something wrong? Fix columns</button>
				) : null}
				{onCancel ? <button type="button" onClick={onCancel} className="text-[13px] underline underline-offset-2">Cancel</button> : null}
				{blocked && !loading ? <span className="text-[12.5px] text-destructive">To continue: {firstBlocker}</span> : null}
			</div>
			<p className="m-0 mt-3 text-[12px] opacity-60">You only do this once. OnRecord never edits your sheet.</p>
		</div>
	);
}
