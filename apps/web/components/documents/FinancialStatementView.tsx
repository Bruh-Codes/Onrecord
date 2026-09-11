"use client";

import { Fragment } from "react";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { FinancialStatement, FinancialStatementValue } from "@/lib/api-types";

const money = new Intl.NumberFormat("en-GH", {
	style: "currency",
	currency: "GHS",
	minimumFractionDigits: 2,
});

export function FinancialStatementView({ documentId }: { documentId: string }) {
	const document = useQuery({
		queryKey: ["document", documentId],
		queryFn: () => api.getDocument(documentId),
	});

	if (document.isLoading) {
		return <p className="m-0 py-4 text-xs opacity-60">Loading extracted statement…</p>;
	}
	if (document.isError) {
		return <p className="m-0 py-4 text-xs text-destructive">Couldn&apos;t load the extracted statement.</p>;
	}

	const statements = document.data?.financial_statements ?? [];
	if (statements.length === 0) {
		return <p className="m-0 py-4 text-xs opacity-60">No structured statement values are available yet.</p>;
	}

	return (
		<div className="space-y-5 py-4">
			{statements.map((statement) => (
				<StatementTable key={statement.statement_index} statement={statement} />
			))}
		</div>
	);
}

function StatementTable({ statement }: { statement: FinancialStatement }) {
	const rows = groupRows(statement.values);
	return (
		<section className="overflow-hidden rounded-xl border border-border bg-white">
			<div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
				<div>
					<h3 className="m-0 text-sm font-semibold">{title(statement.statement_type)}</h3>
					<p className="m-0 mt-0.5 text-[11px] opacity-55">
						Printed values · {statement.currency}{statement.scale > 1 ? ` · source shown in ${statement.scale.toLocaleString()}s` : ""}
					</p>
				</div>
				{statement.validation_issues.length > 0 && (
					<span className="rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-semibold text-destructive">
						Needs totals review
					</span>
				)}
			</div>
			<div className="overflow-x-auto">
				<table className="w-full min-w-[520px] border-collapse text-xs">
					<thead>
						<tr className="bg-muted text-left">
							<th className="px-4 py-2.5 font-semibold">Line item</th>
							{statement.periods.map((period) => <th key={period} className="px-4 py-2.5 text-right font-semibold">{period}</th>)}
							<th className="px-4 py-2.5 text-right font-semibold">Source</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row, index) => (
							<Fragment key={row.lineIndex}>
							{row.section && row.section !== rows[index - 1]?.section && (
								<tr className="border-t border-border bg-muted/60">
									<td colSpan={statement.periods.length + 2} className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide opacity-60">
										{row.section}
									</td>
								</tr>
							)}
							<tr className={`border-t border-border ${row.isTotal ? "font-semibold" : ""}`}>
								<td className="px-4 py-2.5" style={{ paddingLeft: `${16 + row.depth * 12}px` }}>
									{row.label}
									{row.mappingMethod === "model" && <span className="ml-2 text-[10px] font-normal opacity-45">AI mapped</span>}
								</td>
								{statement.periods.map((period) => (
									<td key={period} className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
										{row.values.get(period) ? money.format(row.values.get(period)!.value_pesewas / 100) : "—"}
									</td>
								))}
								<td className="whitespace-nowrap px-4 py-2.5 text-right text-[10px] opacity-50">Page {row.page}</td>
							</tr>
							</Fragment>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}

function groupRows(values: FinancialStatementValue[]) {
	const rows = new Map<number, {
		lineIndex: number; label: string; section: string | null; depth: number; isTotal: boolean; page: number;
		mappingMethod: string | null; values: Map<string, FinancialStatementValue>;
	}>();
	for (const value of values) {
		const row = rows.get(value.line_index) ?? {
			lineIndex: value.line_index,
			label: value.label,
			section: value.section,
			depth: value.depth,
			isTotal: value.is_total,
			page: value.page,
			mappingMethod: value.mapping_method,
			values: new Map(),
		};
		row.values.set(value.period, value);
		rows.set(value.line_index, row);
	}
	return [...rows.values()].sort((a, b) => a.lineIndex - b.lineIndex);
}

function title(statementType: string) {
	return statementType.split("_").map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ");
}
