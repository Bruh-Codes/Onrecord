"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { uploadWithProgress } from "@/lib/hooks/use-documents";
import { farmApi } from "@/lib/farm-api";
import { accraDate, decimalGhs, farmMoney, parsePesewas } from "@/lib/farm-money";
import type { FarmEntry, FarmKind } from "@/lib/farm-types";
import { useFarm } from "./FarmWorkspace";

export function FarmEntryForm({
	entry,
	onSaved,
	onCancel,
}: {
	entry?: FarmEntry;
	onSaved: () => void;
	onCancel?: () => void;
}) {
	const farm = useFarm();
	const qc = useQueryClient();
	const [enterpriseId, setEnterpriseId] = useState(
		entry?.enterprise_id ??
			(entry?.shared_overhead
				? "shared"
				: (farm.filters.enterprise_id ?? farm.enterprises[0]?.id ?? "")),
	);
	const [kind, setKind] = useState<FarmKind>(entry?.kind ?? "expense");
	const [sourceId, setSourceId] = useState(entry?.source_transaction_id ?? "");
	const [evidenceId, setEvidenceId] = useState(entry?.evidence_document_id ?? "");
	const [pending, setPending] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState("");
	const [uploadMessage, setUploadMessage] = useState("");
	const [sourcePage, setSourcePage] = useState(1);
	const [documentPage, setDocumentPage] = useState(1);
	const documents = useQuery({
		queryKey: ["farm-documents", farm.businessId, documentPage],
		queryFn: () => api.listDocuments(farm.businessId, documentPage, 50),
	});
	const transactions = useQuery({
		queryKey: ["farm-sources", farm.businessId, sourcePage],
		queryFn: () => api.listTransactions(farm.businessId, { page_size: 50, page: sourcePage }),
	});
	const enterprise = farm.enterprises.find((row) => row.id === enterpriseId);
	const shared = enterpriseId === "shared";
	const categories = shared
		? farm.options?.overhead_categories
		: enterprise && farm.options?.templates[enterprise.type][kind];
	const source = transactions.data?.items.find((row) => row.id === sourceId);
	const sourceRows =
		transactions.data?.items.filter(
			(row) =>
				!["duplicate", "internal_transfer", "fx", "reversal"].some((flag) => row.flags[flag]) &&
				(kind === "income"
					? row.direction === "in" && row.category_l1 === "revenue"
					: row.direction === "out" && ["cogs", "opex", "tax"].includes(row.category_l1 ?? "")),
		) ?? [];
	if (!farm.enterprises.length)
		return <p className="farm-notice">Add an enterprise before recording farm transactions.</p>;
	return (
		<form
			className="farm-card"
			onSubmit={async (event) => {
				event.preventDefault();
				const form = event.currentTarget;
				const fields = new FormData(form);
				setPending(true);
				setError("");
				try {
					const body = {
						enterprise_id: shared ? null : enterpriseId,
						cycle_id: String(fields.get("cycle_id") || "") || null,
						shared_overhead: shared,
						kind,
						occurred_on: source?.occurred_on ?? String(fields.get("occurred_on")),
						amount_pesewas: sourceId ? null : parsePesewas(String(fields.get("amount"))),
						category: String(fields.get("category")),
						description: String(fields.get("description")).trim(),
						source_transaction_id: sourceId || null,
						evidence_document_id: evidenceId || null,
						currency: "GHS" as const,
					};
					if (entry) await farmApi.updateEntry(farm.businessId, entry.id, body);
					else await farmApi.createEntry(farm.businessId, body);
					await farm.refresh();
					onSaved();
				} catch (failure) {
					setError(
						failure instanceof Error
							? failure.message
							: "Could not save this record. Please retry.",
					);
				} finally {
					setPending(false);
				}
			}}
		>
			<h2 className="text-lg mb-5">
				{entry ? "Edit farm transaction" : "Record an expense or sale"}
			</h2>
			<div className="farm-form-grid">
				<label>
					Enterprise / shared cost
					<select
						value={enterpriseId}
						onChange={(event) => {
							setEnterpriseId(event.target.value);
							if (event.target.value === "shared") setKind("expense");
						}}
					>
						<option value="" disabled>
							Choose enterprise
						</option>
						{farm.enterprises.map((row) => (
							<option value={row.id} key={row.id}>
								{row.name}
							</option>
						))}
						<option value="shared">Shared overhead · unallocated</option>
					</select>
				</label>
				<label>
					Transaction type
					<select
						value={kind}
						onChange={(event) => {
							setKind(event.target.value as FarmKind);
							setSourceId("");
						}}
					>
						<option value="expense">Expense</option>
						{!shared && <option value="income">Sale / income</option>}
					</select>
				</label>
				<label>
					Season / batch
					<select
						name="cycle_id"
						key={enterpriseId}
						defaultValue={entry?.cycle_id ?? farm.filters.cycle_id ?? ""}
						disabled={shared}
					>
						<option value="">No cycle assigned</option>
						{farm.cycles
							.filter((cycle) => cycle.enterprise_id === enterpriseId)
							.map((cycle) => (
								<option value={cycle.id} key={cycle.id}>
									{cycle.name}
								</option>
							))}
					</select>
				</label>
				<label>
					Category
					<select
						name="category"
						required
						key={`${enterpriseId}:${kind}`}
						defaultValue={entry?.category}
					>
						{categories?.map((category) => (
							<option key={category}>{category}</option>
						))}
					</select>
				</label>
				<label>
					Date
					<input
						name="occurred_on"
						type="date"
						required
						max={accraDate()}
						defaultValue={entry?.occurred_on ?? accraDate()}
						readOnly={!!sourceId}
					/>
				</label>
				<label>
					Amount (GHS)
					<input
						name="amount"
						inputMode="decimal"
						required={!sourceId}
						placeholder="e.g. 850.50"
						defaultValue={entry ? decimalGhs(entry.amount_pesewas) : ""}
						disabled={!!sourceId}
					/>
					{!!sourceId && (
						<span className="text-xs text-muted-foreground">
							Uses the saved source amount{source ? `: ${farmMoney(source.amount_pesewas)}` : ""};
							source date is retained.
						</span>
					)}
				</label>
				<label className="sm:col-span-2">
					Description
					<input
						name="description"
						required
						maxLength={400}
						defaultValue={entry?.description}
						placeholder="What was bought or sold?"
					/>
				</label>
			</div>
			<details className="mt-5">
				<summary className="text-sm cursor-pointer text-primary">
					Link a recorded statement transaction
				</summary>
				<p className="text-xs text-muted-foreground mt-2">
					Use this to allocate an existing transaction or match it to this manual entry. The source
					is counted once, and its amount is preserved.
				</p>
				<label className="farm-field mt-3">
					Source transaction
					<select value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
						<option value="">Manual self-reported entry</option>
						{sourceId && !sourceRows.some((row) => row.id === sourceId) && (
							<option value={sourceId}>Current linked source · {sourceId.slice(0, 8)}</option>
						)}
						{sourceRows.map((row) => (
							<option value={row.id} key={row.id}>
								{row.occurred_on} · {farmMoney(row.amount_pesewas)} ·{" "}
								{row.counterparty_raw ?? row.category_l1}
							</option>
						))}
					</select>
				</label>
				{transactions.isError && (
					<p role="alert" className="text-xs mt-2">
						Could not load source transactions.{" "}
						<button type="button" className="underline" onClick={() => transactions.refetch()}>
							Retry
						</button>
					</p>
				)}
				{(transactions.data?.total ?? 0) > 50 && (
					<div className="flex gap-3 text-xs mt-3">
						<button
							type="button"
							disabled={sourcePage === 1}
							onClick={() => setSourcePage(sourcePage - 1)}
						>
							Previous sources
						</button>
						<span>Page {sourcePage}</span>
						<button
							type="button"
							disabled={sourcePage * 50 >= (transactions.data?.total ?? 0)}
							onClick={() => setSourcePage(sourcePage + 1)}
						>
							Next sources
						</button>
					</div>
				)}
			</details>
			<div className="mt-5 border-t border-border pt-5">
				<label className="farm-field">
					Supporting document (optional)
					<select value={evidenceId} onChange={(event) => setEvidenceId(event.target.value)}>
						<option value="">No supporting document linked</option>
						{evidenceId && !documents.data?.items.some((row) => row.id === evidenceId) && (
							<option value={evidenceId}>Current document · {evidenceId.slice(0, 8)}</option>
						)}
						{documents.data?.items.map((document) => (
							<option key={document.id} value={document.id}>
								{document.filename}
							</option>
						))}
					</select>
				</label>
				{documents.isError && (
					<p role="alert" className="text-xs mt-2">
						Could not load documents.{" "}
						<button type="button" className="underline" onClick={() => documents.refetch()}>
							Retry
						</button>
					</p>
				)}
				{(documents.data?.total ?? 0) > 50 && (
					<div className="flex gap-3 text-xs mt-3">
						<button
							type="button"
							disabled={documentPage === 1}
							onClick={() => setDocumentPage(documentPage - 1)}
						>
							Previous documents
						</button>
						<span>Page {documentPage}</span>
						<button
							type="button"
							disabled={documentPage * 50 >= (documents.data?.total ?? 0)}
							onClick={() => setDocumentPage(documentPage + 1)}
						>
							Next documents
						</button>
					</div>
				)}
				<label className="farm-field mt-3">
					Upload a receipt / statement
					<input
						type="file"
						accept="application/pdf,image/jpeg,image/png,image/webp"
						disabled={uploading || pending}
						onChange={async (event) => {
							const file = event.target.files?.[0];
							if (!file) return;
							setUploading(true);
							setUploadMessage("");
							await uploadWithProgress(farm.businessId, [file], (progress) =>
								setUploadMessage(
									progress.state === "done"
										? "Uploaded. Choose the new document above to attach it."
										: (progress.message ?? `Uploading ${progress.name}…`),
								),
							);
							await qc.invalidateQueries({ queryKey: ["farm-documents", farm.businessId] });
							setUploading(false);
						}}
					/>
				</label>
				{uploadMessage && (
					<p role="status" className="text-xs mt-2">
						{uploadMessage}
					</p>
				)}
				<p className="text-xs text-muted-foreground mt-2">
					An attachment supports traceability. It does not independently verify an entry.
				</p>
			</div>
			{error && (
				<p id="farm-entry-error" role="alert" className="farm-notice mt-4">
					{error}
				</p>
			)}
			<div className="flex gap-3 mt-5">
				<button className="farm-button" disabled={pending || uploading || !categories?.length}>
					{pending ? "Saving…" : entry ? "Save changes" : "Save transaction"}
				</button>
				{onCancel && (
					<button type="button" className="farm-button secondary" onClick={onCancel}>
						Cancel edit
					</button>
				)}
			</div>
		</form>
	);
}
