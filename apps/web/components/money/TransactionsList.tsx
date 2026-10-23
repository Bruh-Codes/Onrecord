"use client";

import { useEffect, useState } from "react";

import { CATEGORY_LABELS } from "@/lib/document-review";
import { useToast } from "@/components/ui/Toast";
import { formatGhs } from "@/lib/format";
import {
	type FarmFilter,
	type MoneyTransaction,
	type TransactionQuery,
	useMoneyTransactions,
	useRemoveRecord,
	useTagRecord,
} from "@/lib/money";

const PAGE = 50;
const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const DIRECTIONS: { value: TransactionQuery["direction"]; label: string }[] = [
	{ value: undefined, label: "All" },
	{ value: "in", label: "Money in" },
	{ value: "out", label: "Money out" },
];

export function TransactionsList({
	businessId,
	range,
	filter,
	activities,
	seasons,
}: {
	businessId: string;
	range: { from?: string; to?: string };
	filter: FarmFilter;
	activities: string[];
	seasons: string[];
}) {
	const [tagging, setTagging] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [q, setQ] = useState("");
	const [direction, setDirection] = useState<TransactionQuery["direction"]>(undefined);
	const [category, setCategory] = useState("");
	const [sort, setSort] = useState<NonNullable<TransactionQuery["sort"]>>("newest");
	const [limit, setLimit] = useState(PAGE);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			setQ(search.trim());
			setLimit(PAGE);
		}, 300);
		return () => window.clearTimeout(timer);
	}, [search]);

	const query = useMoneyTransactions(businessId, {
		q: q || undefined, direction, category: category || undefined, sort, limit, ...range, ...filter,
	});
	const data = query.data;

	return (
		<section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="m-0 text-[15px] font-semibold font-[family-name:var(--body-font)]">Transactions</h2>
				{data && (
					<span className="text-[12.5px] text-foreground/60">
						{data.matches.toLocaleString()} found · in {formatGhs(data.money_in_pesewas)} · out {formatGhs(data.money_out_pesewas)}
					</span>
				)}
			</div>

			<div className="mt-3 flex flex-wrap items-center gap-2">
				<input
					type="search"
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					placeholder="Search a name, description or reference"
					aria-label="Search transactions"
					className="min-w-[200px] flex-1 rounded-full border border-border bg-transparent px-3.5 py-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
				/>
				<div className="flex rounded-full border border-border p-0.5" role="group" aria-label="Direction">
					{DIRECTIONS.map((option) => (
						<button
							key={option.label}
							type="button"
							aria-pressed={direction === option.value}
							onClick={() => { setDirection(option.value); setLimit(PAGE); }}
							className={`rounded-full px-3 py-1.5 text-[12.5px] cursor-pointer ${direction === option.value ? "bg-foreground text-background" : "text-foreground/70"}`}
						>
							{option.label}
						</button>
					))}
				</div>
				<select
					aria-label="Category"
					value={category}
					onChange={(event) => { setCategory(event.target.value); setLimit(PAGE); }}
					className="rounded-full border border-border bg-transparent px-3 py-2 text-[12.5px]"
				>
					<option value="">All categories</option>
					{Object.entries(CATEGORY_LABELS).filter(([value]) => value !== "unknown").map(([value, label]) => (
						<option key={value} value={value}>{label}</option>
					))}
					<option value="unclassified">Not categorised</option>
				</select>
				<select
					aria-label="Sort"
					value={sort}
					onChange={(event) => setSort(event.target.value as typeof sort)}
					className="rounded-full border border-border bg-transparent px-3 py-2 text-[12.5px]"
				>
					<option value="newest">Newest first</option>
					<option value="oldest">Oldest first</option>
					<option value="largest">Largest first</option>
				</select>
			</div>

			{query.isError ? (
				<p className="mt-4 text-[13px] text-destructive">Couldn&apos;t load transactions.</p>
			) : !data ? (
				<p className="mt-4 text-[13px] text-foreground/55">Loading…</p>
			) : data.items.length === 0 ? (
				<p className="mt-4 text-[13px] text-foreground/55">No transactions match these filters.</p>
			) : (
				<ul className={`m-0 mt-3 list-none p-0 ${query.isFetching ? "opacity-70" : ""}`}>
					{data.items.map((row) => (
						<li key={row.id} className="flex items-start gap-3 border-t border-border py-2.5">
							<div className="w-[86px] shrink-0 pt-0.5 text-[12px] text-foreground/55">{dateFormatter.format(new Date(row.occurred_on))}</div>
							<div className="min-w-0 flex-1">
								<div className="truncate text-[13.5px] font-semibold">{row.counterparty || row.description || "Transaction"}</div>
								<div className="truncate text-[12px] text-foreground/55">
									{[
										row.counterparty ? row.description : null,
										row.internal_transfer ? "Own transfer" : row.hand_entered ? row.category_l2 : CATEGORY_LABELS[row.category_l1 ?? ""] ?? "Not categorised",
										row.fee_pesewas ? `fees ${formatGhs(row.fee_pesewas)}` : null,
										row.hand_entered ? "Typed in by you" : row.document_name,
									].filter(Boolean).join(" · ")}
								</div>
								<div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px]">
									{[row.farm_activity, row.season].filter(Boolean).map((tag) => (
										<span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-foreground/75">{tag}</span>
									))}
									<button type="button" onClick={() => setTagging(tagging === row.id ? null : row.id)} className="cursor-pointer text-foreground/60 underline underline-offset-2">
										{row.farm_activity || row.season ? "Change tag" : "Tag"}
									</button>
								</div>
								{tagging === row.id && (
									<TagEditor businessId={businessId} row={row} activities={activities} seasons={seasons} onDone={() => setTagging(null)} />
								)}
							</div>
							<div className={`shrink-0 text-right text-[13.5px] font-semibold tabular-nums ${row.direction === "in" ? "text-positive" : ""}`}>
								{row.direction === "in" ? "+" : "−"}{formatGhs(row.amount_pesewas)}
							</div>
						</li>
					))}
				</ul>
			)}
			{data && data.items.length < data.matches && (
				<div className="mt-3 flex justify-center">
					<button
						type="button"
						onClick={() => setLimit((value) => Math.min(value + PAGE, 200))}
						disabled={limit >= 200 || query.isFetching}
						className="rounded-full border border-border px-4 py-2 text-[13px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
					>
						{limit >= 200 ? "Narrow the filters to see more" : "Show more"}
					</button>
				</div>
			)}
		</section>
	);
}

function TagEditor({
	businessId,
	row,
	activities,
	seasons,
	onDone,
}: {
	businessId: string;
	row: MoneyTransaction;
	activities: string[];
	seasons: string[];
	onDone: () => void;
}) {
	const { toast } = useToast();
	const tag = useTagRecord(businessId);
	const remove = useRemoveRecord(businessId);
	const [activity, setActivity] = useState(row.farm_activity ?? "");
	const [season, setSeason] = useState(row.season ?? "");
	const field = "min-w-0 flex-1 rounded-full border border-border bg-background px-3 py-1.5 text-[12.5px]";

	async function save() {
		try {
			await tag.mutateAsync({ id: row.id, farm_activity: activity.trim(), season: season.trim() });
			onDone();
		} catch {
			toast({ title: "Couldn't save the tag", tone: "error" });
		}
	}

	async function removeRecord() {
		if (!window.confirm("Remove this record you typed in?")) return;
		try {
			await remove.mutateAsync(row.id);
			toast({ title: "Record removed", tone: "success" });
		} catch {
			toast({ title: "Couldn't remove the record", tone: "error" });
		}
	}

	return (
		<div className="mt-2 flex flex-wrap items-center gap-2">
			<input className={field} list="tag-activities" placeholder="Crop or animal" aria-label="Crop or animal" value={activity} onChange={(e) => setActivity(e.target.value)} maxLength={80} />
			<input className={field} list="tag-seasons" placeholder="Season" aria-label="Season" value={season} onChange={(e) => setSeason(e.target.value)} maxLength={80} />
			<datalist id="tag-activities">{activities.map((value) => <option key={value} value={value} />)}</datalist>
			<datalist id="tag-seasons">{seasons.map((value) => <option key={value} value={value} />)}</datalist>
			<button type="button" onClick={save} disabled={tag.isPending} className="rounded-full bg-foreground px-3 py-1.5 text-[12.5px] text-background cursor-pointer disabled:opacity-50">
				Save
			</button>
			{row.hand_entered && (
				<button type="button" onClick={removeRecord} disabled={remove.isPending} className="rounded-full border border-border px-3 py-1.5 text-[12.5px] text-destructive cursor-pointer disabled:opacity-50">
					Remove record
				</button>
			)}
		</div>
	);
}
