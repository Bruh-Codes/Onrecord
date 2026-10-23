"use client";
import Link from "next/link";
import { farmMoney } from "@/lib/farm-money";
import type { FinanceGroup, Totals } from "@/lib/farm-types";
import { useFarm } from "./FarmWorkspace";

export function SummaryCards({ totals }: { totals: Totals }) {
	const cards = [
		["Gross recorded receipts", farmMoney(totals.receipts_pesewas)],
		["Recorded expenditures", farmMoney(totals.expenditures_pesewas)],
		["Recorded operating surplus", farmMoney(totals.surplus_pesewas)],
		["Records without evidence", `${totals.without_evidence} / ${totals.count}`],
	];
	return (
		<div className="farm-stat-grid">
			{cards.map(([label, value]) => (
				<div key={label} className="farm-card">
					<p className="text-xs text-muted-foreground">{label}</p>
					<p className="font-semibold text-xl sm:text-2xl tabular-nums mt-3 tracking-tight">
						{value}
					</p>
				</div>
			))}
		</div>
	);
}

export function FinanceTable({ groups, label }: { groups: FinanceGroup[]; label: string }) {
	return (
		<div className="overflow-x-auto">
			<table className="farm-table">
				<caption className="sr-only">{label}</caption>
				<thead>
					<tr>
						<th scope="col">{label}</th>
						<th scope="col">Receipts</th>
						<th scope="col">Expenditures</th>
						<th scope="col">Surplus</th>
					</tr>
				</thead>
				<tbody>
					{groups.map((group) => (
						<tr key={group.key}>
							<th scope="row">{group.label}</th>
							<td className="farm-money-cell">{farmMoney(group.receipts_pesewas)}</td>
							<td className="farm-money-cell">{farmMoney(group.expenditures_pesewas)}</td>
							<td className="farm-money-cell">{farmMoney(group.surplus_pesewas)}</td>
						</tr>
					))}
				</tbody>
			</table>
			{!groups.length && (
				<p className="text-sm py-5 text-muted-foreground">No recorded activity for this scope.</p>
			)}
		</div>
	);
}

export function FarmOverview() {
	const { report, enterprises, cycles, error } = useFarm();
	if (!report)
		return <p className="farm-card">{error ?? "Financial summary unavailable. Retry above."}</p>;
	const max = Math.max(
		1,
		...report.months.flatMap((month) => [month.receipts_pesewas, month.expenditures_pesewas]),
	);
	return (
		<>
			<section className="farm-hero farm-no-print">
				<div>
					<p className="farm-eyebrow">{report.business_name}</p>
					<h2>
						{enterprises.length
							? "Every cedi has a story."
							: "Start with your first farm enterprise."}
					</h2>
					<p>
						{enterprises.length
							? `${enterprises.length} enterprise${enterprises.length === 1 ? "" : "s"} · ${cycles.length} season${cycles.length === 1 ? "" : "s"} / batches. Keep each activity connected to its records.`
							: "Add a crop field, poultry unit, herd or fish pond, then open a season or batch."}
					</p>
				</div>
				<Link
					className="farm-button"
					href={enterprises.length ? "/farm/transactions" : "/farm/enterprises"}
				>
					{enterprises.length ? "+ Record a transaction" : "+ Add an enterprise"}
				</Link>
			</section>
			<SummaryCards totals={report.totals} />
			<div className="farm-two-col mt-5">
				<section className="farm-card">
					<h2 className="text-lg mb-1">Income & expenses over time</h2>
					<p className="text-xs text-muted-foreground mb-5">
						Recorded activity in GHS · green receipts / amber expenditures
					</p>
					<div className="farm-chart" aria-hidden="true">
						{report.months.map((month) => (
							<div key={month.key} className="farm-chart-group">
								<div className="farm-chart-bars">
									<span style={{ height: `${(month.receipts_pesewas / max) * 100}%` }} />
									<span style={{ height: `${(month.expenditures_pesewas / max) * 100}%` }} />
								</div>
								<span className="text-[10px] text-muted-foreground">{month.label}</span>
							</div>
						))}
					</div>
					<FinanceTable groups={report.months} label="Month" />
				</section>
				<section className="farm-card">
					<h2 className="text-lg mb-4">Your next useful step</h2>
					<p className="text-sm leading-relaxed text-muted-foreground">
						{!report.totals.count
							? "Record your first expense or sale. Reports will calculate from your saved records."
							: report.totals.without_evidence
								? `${report.totals.without_evidence} records have no linked evidence. Add a receipt or statement where available.`
								: "Review your reporting period and enterprise allocation before preparing a report."}
					</p>
					<Link href="/farm/transactions" className="farm-button secondary mt-5">
						Review transactions →
					</Link>
					<div className="farm-notice mt-6">
						Recorded surplus is receipts less recorded expenditures. It does not establish net
						profit, financial eligibility or loan approval.
					</div>
				</section>
			</div>
			<section className="farm-card mt-5">
				<h2 className="text-lg mb-3">Enterprise contributions</h2>
				<FinanceTable groups={report.enterprises} label="Enterprise / shared costs" />
				<p className="text-xs text-muted-foreground mt-3">
					Shared overhead stays unallocated and contributes once to business totals.
				</p>
			</section>
		</>
	);
}

export function FarmInsights() {
	const { report } = useFarm();
	if (!report) return <p className="farm-card">Insights are unavailable. Retry above.</p>;
	return (
		<>
			<SummaryCards totals={report.totals} />
			<div className="farm-two-col mt-5">
				<section className="farm-card">
					<p className="farm-eyebrow">Rules-based insights</p>
					<h2 className="text-xl mt-2 mb-4">Understand the recorded numbers.</h2>
					<ul className="space-y-5">
						{report.insights.map((text) => (
							<li key={text} className="text-sm leading-relaxed border-t border-border pt-4">
								{text}
							</li>
						))}
					</ul>
				</section>
				<section className="farm-card">
					<h2 className="text-lg mb-4">Coverage & limitations</h2>
					<ul className="space-y-4 text-sm text-muted-foreground">
						{report.warnings.map((text) => (
							<li key={text}>{text}</li>
						))}
					</ul>
					<Link className="farm-button secondary mt-6" href="/farm/report">
						Prepare finance report →
					</Link>
				</section>
			</div>
			<section className="farm-card mt-5">
				<h2 className="text-lg mb-4">Source breakdown</h2>
				<FinanceTable
					label="Source"
					groups={Object.entries(report.sources).map(([key, totals]) => ({
						key,
						label:
							key === "declared"
								? "Self-reported · unverified"
								: "Document-extracted · not independently verified",
						...totals,
					}))}
				/>
				<p className="text-xs text-muted-foreground mt-4">
					These record summaries do not change OnRecord’s existing evidence-derived readiness score.
				</p>
			</section>
		</>
	);
}
