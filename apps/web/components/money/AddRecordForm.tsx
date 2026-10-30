"use client";

import { useState } from "react";

import { useToast } from "@/components/ui/Toast";
import { useAddRecord, useRecordCategories } from "@/lib/money";
import { accraDate, parsePesewas } from "@/lib/money-input";

const FIELD = "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-[13.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
const LABEL = "grid gap-1.5 text-[12.5px] font-semibold";

/** A cash sale or cost with no statement behind it, such as stock paid for in cash. */
export function AddRecordForm({
	businessId,
	activities,
	seasons,
	defaults,
	onDone,
}: {
	businessId: string;
	activities: string[];
	seasons: string[];
	defaults?: { farm_activity?: string; season?: string };
	onDone: () => void;
}) {
	const { toast } = useToast();
	const categories = useRecordCategories();
	const add = useAddRecord(businessId);
	const [direction, setDirection] = useState<"in" | "out">("out");
	const [amount, setAmount] = useState("");
	const [date, setDate] = useState(accraDate());
	const [category, setCategory] = useState("");
	const [description, setDescription] = useState("");
	const [counterparty, setCounterparty] = useState("");
	const [activity, setActivity] = useState(defaults?.farm_activity ?? "");
	const [season, setSeason] = useState(defaults?.season ?? "");
	const [error, setError] = useState<string | null>(null);
	const options = categories.data?.[direction] ?? [];

	async function save(event: React.FormEvent) {
		event.preventDefault();
		setError(null);
		let pesewas: number;
		try {
			pesewas = parsePesewas(amount);
		} catch (problem) {
			setError((problem as Error).message);
			return;
		}
		if (!category) {
			setError("Choose what the money was for.");
			return;
		}
		try {
			await add.mutateAsync({
				direction, occurred_on: date, amount_pesewas: pesewas, category,
				description: description.trim() || undefined,
				counterparty: counterparty.trim() || undefined,
				farm_activity: activity.trim() || undefined,
				season: season.trim() || undefined,
			});
		} catch (problem) {
			setError((problem as Error).message || "Couldn't save this record. Try again.");
			return;
		}
		toast({ title: "Record added", tone: "success" });
		setAmount("");
		setDescription("");
		setCounterparty("");
		onDone();
	}

	return (
		<form onSubmit={save} className="mb-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="m-0 text-[15px] font-semibold font-[family-name:var(--body-font)]">Add a record</h2>
					<p className="m-0 mt-1 text-[12.5px] text-foreground/60">
						For cash sales and costs that aren't on a MoMo or bank statement. Lenders trust statements and receipts more, so upload those too when you have them.
					</p>
				</div>
				<div className="flex rounded-full border border-border p-0.5" role="group" aria-label="Money in or out">
					{(["out", "in"] as const).map((value) => (
						<button
							key={value}
							type="button"
							aria-pressed={direction === value}
							onClick={() => { setDirection(value); setCategory(""); }}
							className={`rounded-full px-3 py-1.5 text-[12.5px] cursor-pointer ${direction === value ? "bg-foreground text-background" : "text-foreground/70"}`}
						>
							{value === "out" ? "Money out" : "Money in"}
						</button>
					))}
				</div>
			</div>

			<div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				<label className={LABEL}>
					Amount (GH¢)
					<input className={FIELD} inputMode="decimal" placeholder="1350" value={amount} onChange={(e) => setAmount(e.target.value)} required />
				</label>
				<label className={LABEL}>
					Date
					<input className={FIELD} type="date" max={accraDate()} value={date} onChange={(e) => setDate(e.target.value)} required />
				</label>
				<label className={LABEL}>
					What was it for?
					<select className={FIELD} value={category} onChange={(e) => setCategory(e.target.value)} required>
						<option value="">Choose…</option>
						{options.map((option) => <option key={option} value={option}>{option}</option>)}
					</select>
				</label>
				<label className={LABEL}>
					<span>Product or service <span className="font-normal text-foreground/50">(optional)</span></span>
					<input className={FIELD} list="record-activities" placeholder="e.g. Rice, Hair braiding, Tomatoes" value={activity} onChange={(e) => setActivity(e.target.value)} maxLength={80} />
				</label>
				<label className={LABEL}>
					<span>Season or batch <span className="font-normal text-foreground/50">(optional)</span></span>
					<input className={FIELD} list="record-seasons" placeholder="e.g. Christmas 2026, Main season" value={season} onChange={(e) => setSeason(e.target.value)} maxLength={80} />
				</label>
				<label className={LABEL}>
					<span>{direction === "in" ? "Who paid you?" : "Who did you pay?"} <span className="font-normal text-foreground/50">(optional)</span></span>
					<input className={FIELD} value={counterparty} onChange={(e) => setCounterparty(e.target.value)} maxLength={120} />
				</label>
				<label className={`${LABEL} sm:col-span-2 lg:col-span-3`}>
					<span>Note <span className="font-normal text-foreground/50">(optional)</span></span>
					<input className={FIELD} placeholder={direction === "in" ? "e.g. 10 bags of rice sold at Makola" : "e.g. New stock from the wholesaler"} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
				</label>
			</div>
			<datalist id="record-activities">{activities.map((value) => <option key={value} value={value} />)}</datalist>
			<datalist id="record-seasons">{seasons.map((value) => <option key={value} value={value} />)}</datalist>

			{error && <p className="m-0 mt-3 text-[13px] text-destructive" role="alert">{error}</p>}
			<div className="mt-4 flex flex-wrap gap-2">
				<button type="submit" disabled={add.isPending} className="rounded-full bg-foreground px-4 py-2 text-[13px] text-background cursor-pointer disabled:opacity-50">
					{add.isPending ? "Saving…" : "Save record"}
				</button>
				<button type="button" onClick={onDone} className="rounded-full border border-border px-4 py-2 text-[13px] cursor-pointer">
					Close
				</button>
			</div>
		</form>
	);
}
