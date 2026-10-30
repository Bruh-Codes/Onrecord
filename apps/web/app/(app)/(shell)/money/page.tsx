"use client";

import Link from "next/link";
import { useState } from "react";

import { AddRecordForm } from "@/components/money/AddRecordForm";
import { FarmBreakdown } from "@/components/money/FarmBreakdown";
import { LenderNumbers } from "@/components/money/LenderNumbers";
import { MonthlyCashFlowChart } from "@/components/money/MonthlyCashFlowChart";
import { RankedList } from "@/components/money/RankedList";
import { TransactionsList } from "@/components/money/TransactionsList";
import { CATEGORY_LABELS } from "@/lib/document-review";
import { formatGhs } from "@/lib/format";
import { useMe } from "@/lib/hooks/use-business";
import { type FarmFilter, monthLabel, rangeStart, useExampleSeason, useMoneySummary } from "@/lib/money";
import { MoneyPageSkeleton } from "@/components/ui/Skeleton";

const RANGES = [
	{ months: 3, label: "3 months" },
	{ months: 6, label: "6 months" },
	{ months: 12, label: "12 months" },
	{ months: 0, label: "All" },
];

export default function MoneyPage() {
	const { businessId } = useMe();
	const [months, setMonths] = useState(12);
	const [filter, setFilter] = useState<FarmFilter>({});
	const [adding, setAdding] = useState(false);
	const overall = useMoneySummary(businessId, {});
	const latest = overall.data?.latest_on ?? null;
	const range = latest && months ? { from: rangeStart(latest, months) } : {};
	const summary = useMoneySummary(businessId, { ...range, ...filter });
	const data = summary.data;
	const example = useExampleSeason(businessId);
	const tags = overall.data?.farm_tags ?? { activities: [], seasons: [] };
	const addButton = (
		<button
			type="button"
			onClick={() => setAdding((open) => !open)}
			aria-expanded={adding}
			className="rounded-full bg-foreground px-4 py-2 text-[13px] text-background cursor-pointer"
		>
			Add a record
		</button>
	);
	const form = adding && businessId && (
		<AddRecordForm
			businessId={businessId}
			activities={tags.activities}
			seasons={tags.seasons}
			defaults={{
				farm_activity: filter.farm_activity === "untagged" ? undefined : filter.farm_activity,
				season: filter.season === "untagged" ? undefined : filter.season,
			}}
			onDone={() => setAdding(false)}
		/>
	);

	if (!businessId || overall.isLoading || (summary.isLoading && !data)) {
		return <Shell><MoneyPageSkeleton /></Shell>;
	}
	if (overall.isError || summary.isError || !data) {
		return <Shell><p className="text-[13px] text-destructive">Couldn&apos;t load your money picture. Refresh to try again.</p></Shell>;
	}
	if (!overall.data?.latest_on) {
		return (
			<Shell actions={addButton}>
				{data.documents_awaiting_review > 0 && <ReviewBanner count={data.documents_awaiting_review} />}
				{form}
				<div className="rounded-2xl border border-dashed border-foreground/25 bg-muted/50 p-8 text-center">
					<p className="m-0 text-[15px] font-semibold">No transactions yet</p>
					<p className="m-0 mt-1.5 text-[13px] text-foreground/60">
						Upload a MoMo or bank statement, a screenshot, or paste your SMS alerts and we&apos;ll build this page for you. Sales and costs paid in cash can be added with &ldquo;Add a record&rdquo;.
					</p>
					<div className="mt-4 flex flex-wrap justify-center gap-2">
						<Link href="/documents" className="inline-block rounded-full bg-foreground px-4 py-2 text-[13px] text-background no-underline">
							Upload records
						</Link>
						{overall.data?.example_season_available && (
							<button
								type="button"
								onClick={() => example.mutate()}
								disabled={example.isPending}
								className="rounded-full border border-border px-4 py-2 text-[13px] cursor-pointer disabled:opacity-50"
							>
								{example.isPending ? "Adding…" : "See an example (Yaw’s tomato farm)"}
							</button>
						)}
					</div>
				</div>
			</Shell>
		);
	}

	const periods = data.cash_flow.periods;
	const totalIn = periods.reduce((sum, p) => sum + p.money_in_pesewas, 0);
	const totalOut = periods.reduce((sum, p) => sum + p.money_out_pesewas, 0);
	const count = periods.reduce((sum, p) => sum + p.transactions, 0);
	const net = totalIn - totalOut;
	const uncategorised = [...data.categories.money_in, ...data.categories.money_out]
		.filter((c) => c.category === "unclassified")
		.reduce((sum, c) => sum + c.transactions, 0);
	const span = periods.length
		? periods.length === 1
			? monthLabel(periods[0].period, true)
			: `${monthLabel(periods[0].period, true)} – ${monthLabel(periods[periods.length - 1].period, true)}`
		: "No activity in this range";

	return (
		<Shell
			actions={
				<div className="flex flex-wrap items-center gap-2">
					{addButton}
					<div className="flex rounded-full border border-border p-0.5" role="group" aria-label="Time range">
						{RANGES.map((option) => (
							<button
								key={option.label}
								type="button"
								aria-pressed={months === option.months}
								onClick={() => setMonths(option.months)}
								className={`rounded-full px-3 py-1.5 text-[12.5px] cursor-pointer ${months === option.months ? "bg-foreground text-background" : "text-foreground/70"}`}
							>
								{option.label}
							</button>
						))}
					</div>
				</div>
			}
		>
			{data.documents_awaiting_review > 0 && <ReviewBanner count={data.documents_awaiting_review} />}
			{form}
			{(filter.farm_activity || filter.season) && (
				<div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-muted/60 px-4 py-3 text-[13px]" role="status">
					<span>
						Showing only{" "}
						<strong>
							{[filter.farm_activity === "untagged" ? "no product given" : filter.farm_activity, filter.season === "untagged" ? "no season or batch" : filter.season]
								.filter(Boolean)
								.join(" · ")}
						</strong>
					</span>
					<button type="button" onClick={() => setFilter({})} className="cursor-pointer font-semibold underline underline-offset-2">
						Show everything
					</button>
				</div>
			)}

			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				<Stat label="Money in" value={formatGhs(totalIn)} tone="in" />
				<Stat label="Money out" value={formatGhs(totalOut)} />
				<Stat label="In minus out" value={formatGhs(net)} tone={net < 0 ? "negative" : undefined} />
				<Stat label="Transactions" value={count.toLocaleString()} caption={span} />
			</div>

			<section className="mt-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
				<div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
					<h2 className="m-0 text-[15px] font-semibold font-[family-name:var(--body-font)]">Month by month</h2>
					{data.cash_flow.best_period && periods.length > 1 && (
						<span className="text-[12.5px] text-foreground/60">
							Best month {monthLabel(data.cash_flow.best_period, true)} · weakest {monthLabel(data.cash_flow.worst_period ?? "", true)}
						</span>
					)}
				</div>
				<p className="m-0 mb-3 text-[12px] text-foreground/50">Transfers between your own accounts are left out.</p>
				{periods.length ? <MonthlyCashFlowChart periods={periods} /> : <p className="text-[13px] text-foreground/55">No activity in this range.</p>}
			</section>

			<LenderNumbers businessId={businessId} months={months || 12} />

			<FarmBreakdown farm={data.farm} filter={filter} onFilter={setFilter} />

			<div className="mt-4 grid gap-4 md:grid-cols-2">
				<RankedList
					title="Who pays you"
					tone="in"
					empty="No money in for this range."
					items={data.top_customers.counterparties.map((c) => ({
						key: c.name, label: c.name, amount_pesewas: c.amount_pesewas, share: c.share_of_total,
						detail: `${c.transactions}×`,
					}))}
				/>
				<RankedList
					title="Who you pay"
					tone="out"
					empty="No money out for this range."
					items={data.top_suppliers.counterparties.map((c) => ({
						key: c.name, label: c.name, amount_pesewas: c.amount_pesewas, share: c.share_of_total,
						detail: `${c.transactions}×`,
					}))}
				/>
				<RankedList
					title="Where money comes from"
					tone="in"
					empty="No money in for this range."
					items={data.categories.money_in.map((c) => ({
						key: c.category, label: categoryLabel(c.category), amount_pesewas: c.amount_pesewas, share: c.share,
					}))}
				/>
				<RankedList
					title="Where money goes"
					tone="out"
					empty="No money out for this range."
					items={data.categories.money_out.map((c) => ({
						key: c.category, label: categoryLabel(c.category), amount_pesewas: c.amount_pesewas, share: c.share,
					}))}
				/>
			</div>

			{uncategorised > 0 && (
				<div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-muted/60 px-4 py-3 text-[13px]">
					<span>
						{uncategorised === 1 ? "1 transaction isn't" : `${uncategorised} transactions aren't`} sorted into sales or costs yet. Sorting them makes your figures more accurate for a lender.
					</span>
					<Link href="/reviewer" className="font-semibold underline underline-offset-2">Sort now</Link>
				</div>
			)}

			<div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-[13px]">
				<span>Need to show these figures to a bank, MFI or co-op?</span>
				<Link href="/lender-summary" className="font-semibold underline underline-offset-2">Open lender summary</Link>
			</div>

			<div className="mt-4">
				<TransactionsList businessId={businessId} range={range} filter={filter} activities={tags.activities} seasons={tags.seasons} />
			</div>
		</Shell>
	);
}

function categoryLabel(category: string): string {
	if (category === "unclassified") return "Not categorised";
	return CATEGORY_LABELS[category] ?? category;
}

function Shell({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
	return (
		<div className="flex-1 min-w-0 px-4 sm:px-7 pt-6 sm:pt-7.5 pb-10 max-w-[1100px]">
			<div className="mb-5 flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="text-[24px] sm:text-[28px] m-0 mb-1.5">Money in &amp; out</h1>
					<p className="text-sm opacity-70 m-0">Everything that came in and went out, and the numbers a lender works out from it.</p>
				</div>
				{actions}
			</div>
			{children}
		</div>
	);
}

function Stat({ label, value, caption, tone }: { label: string; value: string; caption?: string; tone?: "in" | "negative" }) {
	return (
		<div className="rounded-2xl border border-border bg-card p-4">
			<div className="text-[12.5px] text-foreground/60">{label}</div>
			<div className={`mt-1 font-display text-[22px] sm:text-[26px] leading-tight tabular-nums ${tone === "in" ? "text-positive" : tone === "negative" ? "text-destructive" : ""}`}>
				{value}
			</div>
			{caption && <div className="mt-1 text-[11.5px] text-foreground/50">{caption}</div>}
		</div>
	);
}

function ReviewBanner({ count }: { count: number }) {
	return (
		<div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/35 bg-warning/10 px-4 py-3 text-[13px]" role="status">
			<span>
				{count === 1 ? "1 document has" : `${count} documents have`} rows waiting for you to check. They&apos;re not counted here yet.
			</span>
			<Link href="/documents" className="font-semibold underline underline-offset-2">Check rows</Link>
		</div>
	);
}
