"use client";

import { useState } from "react";

import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { PillButton } from "@/components/ui/PillButton";
import { useToast } from "@/components/ui/Toast";
import { useAddRecord, useRecordCategories } from "@/lib/money";
import { accraDate, parsePesewas } from "@/lib/money-input";

const FIELD = "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-[13.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
const LABEL = "grid gap-1.5 text-[12.5px] font-semibold";

type AddRecordProps = {
	businessId: string;
	activities: string[];
	seasons: string[];
	defaults?: { farm_activity?: string; season?: string };
};

/**
 * "Add a record" in a bottom drawer: a cash sale or cost with no statement
 * behind it, such as stock paid for in cash. The drawer closes on save.
 */
export function AddRecordDrawer({
	open,
	onOpenChange,
	...props
}: AddRecordProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent aria-describedby="add-record-description">
				{/* The form mounts on open, so every open starts with a clean form. */}
				<AddRecordForm {...props} onDone={() => onOpenChange(false)} />
			</DrawerContent>
		</Drawer>
	);
}

function AddRecordForm({
	businessId,
	activities,
	seasons,
	defaults,
	onDone,
}: AddRecordProps & { onDone: () => void }) {
	const { toast } = useToast();
	const categories = useRecordCategories();
	const add = useAddRecord(businessId);
	// Cash sales are the usual reason to type a record in, so start on Money in.
	const [direction, setDirection] = useState<"in" | "out">("in");
	const [amount, setAmount] = useState("");
	const [date, setDate] = useState(accraDate());
	const [category, setCategory] = useState("");
	const [description, setDescription] = useState("");
	const [counterparty, setCounterparty] = useState("");
	const [activity, setActivity] = useState(defaults?.farm_activity ?? "");
	const [season, setSeason] = useState(defaults?.season ?? "");
	const [error, setError] = useState<string | null>(null);
	const [showMore, setShowMore] = useState(Boolean(defaults?.farm_activity || defaults?.season));
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
		onDone();
	}

	return (
		<form onSubmit={save} className="mx-auto flex min-h-0 w-full max-w-[720px] flex-col">
			<DrawerHeader className="sm:flex-row sm:items-start sm:justify-between sm:gap-4">
				<div className="grid gap-1">
					<DrawerTitle className="font-[family-name:var(--body-font)]">Add a record</DrawerTitle>
					<DrawerDescription id="add-record-description">
						For cash sales and costs that aren&apos;t on a statement.
					</DrawerDescription>
				</div>
				<div className="mt-2 flex shrink-0 self-start rounded-full border border-border p-0.5 sm:mt-0" role="group" aria-label="Money in or out">
					{(["in", "out"] as const).map((value) => (
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
			</DrawerHeader>

			<div className="min-h-0 overflow-y-auto px-5 pt-2 pb-1">
				<div className="grid gap-3 sm:grid-cols-2">
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
					{!showMore && (
						<button
							type="button"
							onClick={() => setShowMore(true)}
							className="justify-self-start bg-transparent border-none p-0 text-[12.5px] font-semibold underline underline-offset-2 cursor-pointer sm:col-span-2"
						>
							More details (optional)
						</button>
					)}
					{showMore && <>
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
					<label className={`${LABEL} sm:col-span-2`}>
						<span>Note <span className="font-normal text-foreground/50">(optional)</span></span>
						<input className={FIELD} placeholder={direction === "in" ? "e.g. 10 bags of rice sold at Makola" : "e.g. New stock from the wholesaler"} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
					</label>
					</>}
				</div>
				<datalist id="record-activities">{activities.map((value) => <option key={value} value={value} />)}</datalist>
				<datalist id="record-seasons">{seasons.map((value) => <option key={value} value={value} />)}</datalist>
				{error && <p className="m-0 mt-3 text-[13px] text-destructive" role="alert">{error}</p>}
			</div>

			<DrawerFooter className="border-t border-border sm:flex-row sm:justify-end">
				<DrawerClose asChild>
					<PillButton variant="secondary" className="sm:mr-auto">Cancel</PillButton>
				</DrawerClose>
				<PillButton type="submit" disabled={add.isPending}>
					{add.isPending ? "Saving…" : "Save record"}
				</PillButton>
			</DrawerFooter>
		</form>
	);
}
