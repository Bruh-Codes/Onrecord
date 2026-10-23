"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { farmApi } from "@/lib/farm-api";
import { farmMoney } from "@/lib/farm-money";
import type { FarmEntry } from "@/lib/farm-types";
import { FarmEntryForm } from "./FarmEntryForm";
import { useFarm } from "./FarmWorkspace";

export function EntryTable({
	entries,
	onEdit,
	onDelete,
}: {
	entries: FarmEntry[];
	onEdit?: (entry: FarmEntry) => void;
	onDelete?: (entry: FarmEntry) => void;
}) {
	return (
		<div className="overflow-x-auto">
			<table className="farm-table">
				<caption className="sr-only">Recorded farm transactions</caption>
				<thead>
					<tr>
						<th scope="col">Date / enterprise</th>
						<th scope="col">Activity</th>
						<th scope="col">Source / evidence</th>
						<th scope="col">Amount</th>
						{onEdit && <th scope="col">Actions</th>}
					</tr>
				</thead>
				<tbody>
					{entries.map((entry) => (
						<tr key={entry.id}>
							<td>
								{entry.occurred_on}
								<span className="block text-xs text-muted-foreground mt-1">
									{entry.enterprise_name ?? "Shared overhead"}
								</span>
							</td>
							<td>
								<b>{entry.category}</b>
								<span className="block text-xs text-muted-foreground mt-1">
									{entry.description}
								</span>
							</td>
							<td>
								<span className="farm-chip">
									{entry.value_kind === "declared" ? "Self-reported" : "Document-extracted"}
								</span>
								<span className="block text-xs text-muted-foreground mt-2">
									{entry.evidence_status === "attached"
										? "Document attached · unverified"
										: "No document linked"}
								</span>
								<span className="farm-source-ref">
									Record: {entry.id}
									{entry.source_transaction_id ? ` · Source: ${entry.source_transaction_id}` : ""}
									{entry.evidence_document_id ? ` · Document: ${entry.evidence_document_id}` : ""}
								</span>
							</td>
							<td className="farm-money-cell whitespace-nowrap tabular-nums">
								<b className={entry.kind === "income" ? "text-primary" : ""}>
									{entry.kind === "income" ? "+" : "−"}
									{farmMoney(entry.amount_pesewas)}
								</b>
								{entry.fee_pesewas + entry.levy_pesewas > 0 && (
									<span className="block text-xs text-muted-foreground mt-1">
										+ {farmMoney(entry.fee_pesewas + entry.levy_pesewas)} fees / levies
									</span>
								)}
							</td>
							{onEdit && (
								<td>
									<div className="flex gap-3">
										<button
											className="text-primary underline text-xs"
											onClick={() => onEdit(entry)}
										>
											Edit
										</button>
										<button
											className="text-destructive underline text-xs"
											onClick={() => onDelete?.(entry)}
										>
											Remove
										</button>
									</div>
								</td>
							)}
						</tr>
					))}
				</tbody>
			</table>
			{!entries.length && (
				<p className="text-sm text-muted-foreground py-6">
					No transactions recorded for this scope.
				</p>
			)}
		</div>
	);
}

export function FarmTransactions() {
	const farm = useFarm();
	const [page, setPage] = useState(1);
	const [editing, setEditing] = useState<FarmEntry | undefined>();
	const [formVersion, setFormVersion] = useState(0);
	const [error, setError] = useState("");
	const [removing, setRemoving] = useState(false);
	const [scope, setScope] = useState("");
	const nextScope = JSON.stringify([farm.businessId, farm.filters]);
	const currentPage = scope === nextScope ? page : 1;
	const rows = useQuery({
		queryKey: ["farm-entries", farm.businessId, farm.filters, currentPage],
		queryFn: () => farmApi.entries(farm.businessId, farm.filters, currentPage),
	});
	const reset = () => {
		setEditing(undefined);
		setFormVersion((value) => value + 1);
		setScope(nextScope);
		setPage(1);
	};
	return (
		<>
			<div className="flex flex-wrap justify-between gap-3 mb-5">
				<h2 className="text-xl">Farm transactions</h2>
				<Link href="/farm/enterprises" className="text-sm text-primary underline">
					Manage enterprises & cycles
				</Link>
			</div>
			<FarmEntryForm
				key={`${farm.businessId}:${editing?.id ?? formVersion}`}
				entry={editing?.business_id === farm.businessId ? editing : undefined}
				onSaved={reset}
				onCancel={editing ? reset : undefined}
			/>
			<section className="farm-card mt-5" aria-busy={removing}>
				<h2 className="text-lg mb-4">Saved records</h2>
				{(error || rows.error) && (
					<p role="alert" className="farm-notice mb-4">
						{error || rows.error?.message}
					</p>
				)}
				{rows.isLoading ? (
					<p role="status">Loading transactions…</p>
				) : (
					<EntryTable
						entries={rows.data?.items ?? []}
						onEdit={(entry) => {
							setEditing(entry);
							window.scrollTo({ top: 0, behavior: "smooth" });
						}}
						onDelete={async (entry) => {
							if (
								removing ||
								!window.confirm(
									"Remove this farm entry? Its audit history and original source document will be retained.",
								)
							)
								return;
							setRemoving(true);
							setError("");
							try {
								await farmApi.deleteEntry(farm.businessId, entry.id);
								await farm.refresh();
								if (editing?.id === entry.id) reset();
							} catch (failure) {
								setError(
									failure instanceof Error ? failure.message : "Could not remove this entry.",
								);
							} finally {
								setRemoving(false);
							}
						}}
					/>
				)}
				<div className="flex items-center gap-4 text-sm mt-5">
					<button
						className="farm-button secondary"
						disabled={currentPage === 1}
						onClick={() => {
							setScope(nextScope);
							setPage(currentPage - 1);
						}}
					>
						Previous
					</button>
					<span>
						{rows.data?.total ?? 0} records · page {currentPage}
					</span>
					<button
						className="farm-button secondary"
						disabled={currentPage * 25 >= (rows.data?.total ?? 0)}
						onClick={() => {
							setScope(nextScope);
							setPage(currentPage + 1);
						}}
					>
						Next
					</button>
				</div>
			</section>
		</>
	);
}
