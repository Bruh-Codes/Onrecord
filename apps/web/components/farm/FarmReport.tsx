"use client";
import { farmMoney, decimalGhs } from "@/lib/farm-money";
import { EntryTable } from "./FarmTransactions";
import { FinanceTable, SummaryCards } from "./FarmSummary";
import { useFarm } from "./FarmWorkspace";

function csvCell(value: string) {
	const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
	return `"${safe.replaceAll('"', '""')}"`;
}

export function FarmReportPage() {
	const { report, enterprises, cycles } = useFarm();
	if (!report) return <p className="farm-card">Report unavailable. Retry above.</p>;
	const enterprise = enterprises.find((row) => row.id === report.enterprise_id);
	const cycle = cycles.find((row) => row.id === report.cycle_id);
	const download = () => {
		const rows = [
			[
				"Business",
				"Date",
				"Enterprise",
				"Type",
				"Category",
				"Description",
				"Amount GHS",
				"Fees and levies GHS",
				"Source",
				"Evidence",
				"Record ID",
				"Source transaction ID",
				"Evidence document ID",
			],
			...report.entries.map((entry) => [
				report.business_name,
				entry.occurred_on,
				entry.enterprise_name ?? "Shared overhead",
				entry.kind,
				entry.category,
				entry.description,
				decimalGhs(entry.amount_pesewas),
				decimalGhs(entry.fee_pesewas + entry.levy_pesewas),
				entry.value_kind,
				entry.evidence_status,
				entry.id,
				entry.source_transaction_id ?? "",
				entry.evidence_document_id ?? "",
			]),
		];
		const url = URL.createObjectURL(
			new Blob(["\uFEFF", rows.map((row) => row.map(csvCell).join(",")).join("\r\n")], {
				type: "text/csv;charset=utf-8",
			}),
		);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `onrecord-farm-records-${report.record_version}.csv`;
		anchor.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	};
	return (
		<>
			<div className="flex flex-wrap items-center justify-between gap-4 mb-5 farm-no-print">
				<div>
					<h2 className="text-xl">Financial summary for lender discussion</h2>
					<p className="text-sm text-muted-foreground mt-2">
						Review the scope and limitations before saving or sharing your report.
					</p>
				</div>
				<div className="flex gap-3">
					<button className="farm-button secondary" onClick={download}>
						Export records CSV
					</button>
					<button className="farm-button" onClick={() => window.print()}>
						Print / Save PDF
					</button>
				</div>
			</div>
			<article className="farm-report-paper farm-card">
				<header className="flex flex-wrap justify-between gap-4 border-b-2 border-primary pb-6 mb-6">
					<div>
						<p className="farm-eyebrow">OnRecord · Farmer financial summary</p>
						<h2 className="text-2xl mt-3">{report.business_name}</h2>
						<p className="text-sm text-muted-foreground mt-2">
							{report.region ?? "Ghana"} · {enterprise?.name ?? "All farm enterprises"}
							{cycle ? ` · ${cycle.name}` : ""}
						</p>
					</div>
					<div>
						<span className="farm-chip">Self-reported / document-linked · not audited</span>
						{report.is_demo && (
							<p className="text-sm font-semibold text-amber-700 mt-2">FICTIONAL DEMONSTRATION</p>
						)}
					</div>
				</header>
				<dl className="grid sm:grid-cols-2 gap-3 text-sm mb-6">
					<div>
						<dt className="text-muted-foreground">Reporting period</dt>
						<dd>
							{report.period_from ?? "No records"} to {report.period_to ?? "No records"}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Generated (Africa/Accra)</dt>
						<dd>
							{new Date(report.generated_at).toLocaleString("en-GH", { timeZone: "Africa/Accra" })}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Record coverage</dt>
						<dd>
							{report.totals.count} entries · {report.totals.without_evidence} without linked
							evidence
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Calculation / record version</dt>
						<dd>
							{report.formula_version} · {report.record_version}
						</dd>
					</div>
				</dl>
				<SummaryCards totals={report.totals} />
				<p className="text-sm leading-relaxed mt-5">
					Available records show gross receipts of {farmMoney(report.totals.receipts_pesewas)} and
					expenditures of {farmMoney(report.totals.expenditures_pesewas)}, giving a recorded
					operating surplus of {farmMoney(report.totals.surplus_pesewas)}. These figures describe
					recorded activity and may omit other financial obligations.
				</p>
				<section className="mt-7">
					<h3 className="text-lg mb-3">Source & completeness</h3>
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
					<ul className="farm-notice mt-4 space-y-2">
						{report.warnings.map((warning) => (
							<li key={warning}>{warning}</li>
						))}
					</ul>
				</section>
				<section className="mt-7">
					<h3 className="text-lg mb-3">Enterprise breakdown</h3>
					<FinanceTable groups={report.enterprises} label="Enterprise / shared costs" />
				</section>
				<section className="mt-7">
					<h3 className="text-lg mb-3">Monthly record summary</h3>
					<FinanceTable groups={report.months} label="Month" />
				</section>
				<section className="mt-7">
					<h3 className="text-lg mb-3">Methodology</h3>
					<p className="text-xs leading-relaxed text-muted-foreground">{report.method}</p>
				</section>
				<section className="mt-7">
					<h3 className="text-lg mb-3">Transaction history & references</h3>
					<EntryTable entries={report.entries} />
				</section>
				<footer className="mt-7 pt-5 border-t border-border text-xs text-muted-foreground leading-relaxed">
					Prepared from recorded activity in OnRecord. No independent verification, loan approval,
					credit rating or lender acceptance is implied.{" "}
					{report.is_demo
						? "All farmer details and amounts are fictional."
						: "The business owner should review this report alongside original supporting documents."}
				</footer>
			</article>
		</>
	);
}
