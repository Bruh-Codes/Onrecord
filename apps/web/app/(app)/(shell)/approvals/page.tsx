"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { PillButton } from "@/components/ui/PillButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { ApiError } from "@/lib/api";
import {
	type ApprovalItem,
	type ApprovalState,
	canReview,
	openOriginalFile,
	useApprovals,
	useResolveApproval,
} from "@/lib/approvals";
import { useExtractedRows } from "@/lib/document-review";
import { formatGhs } from "@/lib/format";
import { useMe } from "@/lib/hooks/use-business";
import { askOna } from "@/lib/ona";
import { setOnaFocus } from "@/lib/ona-focus";

const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function formatDate(value: string | null) {
	return value ? dateFormatter.format(new Date(value)) : null;
}

/** The one line that tells a reviewer why this upload is waiting. */
function reasonLabel(item: ApprovalItem): string {
	if (item.waiting_on_owner) return "Owner hasn't checked the rows yet";
	if (item.incomplete_read) return "Not every row was read";
	if (item.balance_check === "balance_breaks") return "Balances don't add up";
	if (item.balance_check === "unverifiable") return "Balances couldn't be checked";
	if (item.document_status === "failed") return "Couldn't be read";
	if (item.review_status === "pending") return "Not checked yet";
	return "Owner-confirmed rows";
}

function StatusBadges({ item }: { item: ApprovalItem }) {
	return (
		<div className="flex flex-wrap gap-1.5">
			{item.review_status === "approved" && <Badge tone="positive">Approved</Badge>}
			{item.review_status === "rejected" && <Badge tone="negative">Rejected</Badge>}
			{item.balance_check === "balance_breaks" && <Badge tone="negative">Balances don&apos;t add up</Badge>}
			{item.balance_check === "unverifiable" && <Badge tone="warning">No balance check</Badge>}
			{item.incomplete_read && <Badge tone="negative">Incomplete read</Badge>}
			{item.waiting_on_owner && <Badge tone="neutral">Waiting on owner</Badge>}
			{item.document_status === "failed" && <Badge tone="negative">Couldn&apos;t be read</Badge>}
		</div>
	);
}

export default function ApprovalsPage() {
	const me = useMe();
	const allowed = canReview(me.data?.role);
	const [tab, setTab] = useState<ApprovalState>("open");
	const approvals = useApprovals(tab, allowed);
	const items = approvals.data ?? [];
	const [selectedState, setSelected] = useState<string | null>(null);
	const selectedId = items.some((i) => i.document_id === selectedState) ? selectedState : (items[0]?.document_id ?? null);
	const selected = items.find((i) => i.document_id === selectedId) ?? null;

	// Until /v1/me answers (it can't on the server), show a placeholder rather
	// than the no-access message, so server and client render the same thing.
	if (!me.data && !me.isError) {
		return (
			<div className="px-4 sm:px-10 py-8 max-w-[1200px] mx-auto">
				<Skeleton className="h-8 w-48 mb-3" />
				<Skeleton className="h-4 w-96" />
			</div>
		);
	}
	if (!allowed) {
		return (
			<div className="px-4 sm:px-10 py-8 max-w-[720px] mx-auto">
				<h1 className="text-[26px] m-0 mb-2">Approvals</h1>
				<p className="text-sm opacity-75 m-0">This page is for OnRecord reviewers. Ask an admin if you need access.</p>
			</div>
		);
	}

	return (
		<div className="px-4 sm:px-10 py-6 sm:py-8 pb-16 max-w-[1200px] mx-auto">
			<div className="mb-1.5 text-[11px] tracking-wider uppercase text-foreground/55">Review</div>
			<h1 className="text-[24px] sm:text-[30px] m-0 mb-1.5">Approvals</h1>
			<p className="text-sm opacity-75 m-0 mb-5 max-w-[720px]">
				Uploads we couldn&apos;t fully trust are kept out of loan readiness until someone checks them. Compare the rows
				with the original file, then approve them or send them back to the owner with a note.
			</p>

			<div role="tablist" className="inline-flex rounded-full bg-muted p-1 mb-5">
				{(["open", "done"] as const).map((value) => (
					<button
						key={value}
						type="button"
						role="tab"
						aria-selected={tab === value}
						onClick={() => setTab(value)}
						className={`rounded-full px-4 py-1.5 text-[13px] cursor-pointer ${tab === value ? "bg-card font-semibold shadow-sm" : "opacity-70"}`}
					>
						{value === "open" ? `Waiting${tab === "open" && approvals.data ? ` (${items.length})` : ""}` : "Decided"}
					</button>
				))}
			</div>

			{approvals.isLoading && (
				<div aria-busy="true" aria-label="Loading approvals" className="flex flex-col gap-3">
					{[0, 1, 2].map((i) => (
						<div key={i} className="rounded-[20px] border border-border bg-card p-5 space-y-2">
							<Skeleton className="h-4 w-1/2" />
							<Skeleton className="h-3 w-1/3" />
						</div>
					))}
				</div>
			)}
			{approvals.isError && (
				<div className="rounded-[20px] border border-destructive/30 bg-destructive-background p-6 text-sm text-destructive">
					We couldn&apos;t load approvals. Try refreshing the page.
				</div>
			)}
			{!approvals.isLoading && !approvals.isError && items.length === 0 && (
				<div className="rounded-[20px] bg-muted p-8 text-center">
					<div className="text-lg font-semibold mb-1">{tab === "open" ? "Nothing waiting" : "No decisions yet"}</div>
					<div className="text-sm text-foreground/60">
						{tab === "open"
							? "When an upload needs a reviewer's check, it shows up here."
							: "Uploads you approve or reject will be listed here."}
					</div>
				</div>
			)}

			{selected && (
				<div className="grid gap-6 items-start grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)]">
					<ul className="m-0 p-0 list-none flex flex-col gap-2" aria-label="Uploads">
						{items.map((item) => (
							<li key={item.document_id}>
								<button
									type="button"
									onClick={() => setSelected(item.document_id)}
									aria-current={item.document_id === selectedId ? "true" : undefined}
									className={`w-full text-left rounded-[16px] border p-4 cursor-pointer transition-colors ${
										item.document_id === selectedId ? "border-foreground/40 bg-accent" : "border-border bg-card hover:bg-accent/60"
									}`}
								>
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<div className="font-semibold text-[14px] truncate">{item.business_name}</div>
											<div className="text-[12.5px] text-foreground/60 truncate">{item.filename}</div>
										</div>
										<div className="text-[11.5px] text-foreground/50 shrink-0">
											{dateTimeFormatter.format(new Date(item.reviewed_at ?? item.uploaded_at))}
										</div>
									</div>
									<div className="mt-2 text-[12.5px]">
										{tab === "open" ? (
											<span className="text-destructive">{reasonLabel(item)}</span>
										) : (
											<span className={item.review_status === "approved" ? "text-positive" : "text-destructive"}>
												{item.review_status === "approved" ? "Approved" : "Rejected"}
											</span>
										)}
										<span className="text-foreground/50"> · {item.transaction_count} transactions</span>
									</div>
								</button>
							</li>
						))}
					</ul>
					<ApprovalDetail key={selected.document_id} item={selected} />
				</div>
			)}
		</div>
	);
}

function ApprovalDetail({ item }: { item: ApprovalItem }) {
	const rows = useExtractedRows(item.document_id);
	const resolve = useResolveApproval();
	const [note, setNote] = useState("");
	const [showAll, setShowAll] = useState(false);
	const [fileError, setFileError] = useState<string | null>(null);
	const [opening, setOpening] = useState(false);
	const decided = item.review_status === "approved" || item.review_status === "rejected";
	const period = [formatDate(item.period_start), formatDate(item.period_end)].filter(Boolean).join(" to ");
	const allRows = rows.data?.rows ?? [];
	const visibleRows = showAll ? allRows : allRows.slice(0, 25);
	const notes = item.findings.filter((f) => f.code !== "BALANCE_CHECK" && f.code !== "READ_TRUNCATED");
	const balanceFinding = item.findings.find((f) => f.code === "BALANCE_CHECK");

	// Point the Ona bubble at this upload while it is open.
	useEffect(() => {
		setOnaFocus({ businessId: item.business_id, documentId: item.document_id, label: item.business_name });
		return () => setOnaFocus(null);
	}, [item.business_id, item.document_id, item.business_name]);

	const decide = (decision: "approved" | "rejected") => {
		if (!note.trim()) return;
		resolve.mutate({ documentId: item.document_id, decision, note: note.trim() });
	};
	const openFile = async () => {
		setFileError(null);
		setOpening(true);
		try {
			await openOriginalFile(item.document_id);
		} catch (error) {
			setFileError(error instanceof Error ? error.message : "The original file couldn't be opened.");
		} finally {
			setOpening(false);
		}
	};

	return (
		<section className="rounded-[20px] border border-border bg-card p-5 sm:p-6" aria-label={`Review ${item.filename}`}>
			<div className="flex flex-wrap items-start justify-between gap-3 mb-3">
				<div className="min-w-0">
					<div className="text-[12px] uppercase tracking-wider text-foreground/55">{item.business_name}</div>
					<h2 className="text-[19px] m-0 break-words">{item.filename}</h2>
					<div className="text-[12.5px] text-foreground/60">
						Uploaded {dateTimeFormatter.format(new Date(item.uploaded_at))}
						{period ? ` · covers ${period}` : ""}
					</div>
				</div>
				<PillButton variant="secondary" onClick={openFile} disabled={opening}>
					{opening ? "Opening…" : "Open original file"}
				</PillButton>
			</div>
			{fileError && <p className="text-[12.5px] text-destructive m-0 mb-2">{fileError}</p>}
			<div className="flex flex-wrap gap-2 mb-3">
				<button
					type="button"
					onClick={() => askOna("Check this upload for me. Do the rows look complete for the file, do the balances follow on, and what should I look at before I decide?")}
					className="rounded-full border border-border px-3 py-1 text-[12.5px] cursor-pointer hover:bg-accent"
				>
					Ask Ona to check this upload
				</button>
				{!decided && (
					<button
						type="button"
						onClick={() => askOna("Draft a short, kind note to the owner explaining why this upload can't be approved yet and what they should upload instead.")}
						className="rounded-full border border-border px-3 py-1 text-[12.5px] cursor-pointer hover:bg-accent"
					>
						Draft a note to the owner
					</button>
				)}
			</div>
			<StatusBadges item={item} />

			<dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-5">
				{[
					["Rows read", item.rows_read ?? "—"],
					["In records", item.transaction_count],
					["Money in", formatGhs(item.money_in_pesewas)],
					["Money out", formatGhs(item.money_out_pesewas)],
				].map(([label, value]) => (
					<div key={String(label)} className="rounded-[12px] bg-muted px-3 py-2.5">
						<dt className="text-[11px] text-foreground/55">{label}</dt>
						<dd className="m-0 font-semibold text-[15px]">{value}</dd>
					</div>
				))}
			</dl>

			{item.summary && <p className="text-[13.5px] m-0 mb-3">{item.summary}</p>}
			{balanceFinding && (
				<p className="text-[13px] m-0 mb-3 text-foreground/75">
					<span className="font-semibold">Balance check: </span>
					{balanceFinding.reason}
				</p>
			)}
			{item.incomplete_read && (
				<p className="text-[13px] m-0 mb-3 rounded-[12px] bg-destructive-background text-destructive px-3 py-2">
					The reader didn&apos;t get every row from this file. Unless the rows below match the whole file, reject it and
					ask the owner to upload it again.
				</p>
			)}
			{notes.length > 0 && (
				<div className="mb-4">
					<div className="text-[12px] font-semibold mb-1">What the reader noticed</div>
					<ul className="m-0 pl-5 list-disc text-[13px] text-foreground/80 space-y-1">
						{notes.map((f, i) => (
							<li key={i}>{f.reason}</li>
						))}
					</ul>
				</div>
			)}

			<div className="text-[12px] font-semibold mb-1.5">Rows</div>
			{rows.isLoading && <Skeleton className="h-24 w-full" />}
			{rows.isError && <p className="text-[13px] text-foreground/60 m-0">Rows couldn&apos;t be loaded for this file.</p>}
			{!rows.isLoading && !rows.isError && allRows.length === 0 && (
				<p className="text-[13px] text-foreground/60 m-0">No rows were read from this file.</p>
			)}
			{allRows.length > 0 && (
				<div className="rounded-[14px] bg-muted overflow-x-auto">
					<table className="w-full border-collapse text-[12.5px]">
						<thead>
							<tr>
								{["Date", "Description", "In", "Out", "Balance"].map((h) => (
									<th key={h} className={`px-3 py-2 text-[10.5px] uppercase tracking-wider text-foreground/55 border-b border-foreground/12 ${h === "Date" || h === "Description" ? "text-left" : "text-right"}`}>
										{h}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{visibleRows.map((row) => (
								<tr key={row.id} className={row.excluded ? "opacity-45 line-through" : ""}>
									<td className="px-3 py-1.5 border-b border-foreground/6 whitespace-nowrap">{row.occurred_on}</td>
									<td className="px-3 py-1.5 border-b border-foreground/6 max-w-[260px] truncate" title={row.description}>
										{row.description}
										{row.corrected && <span className="ml-1 text-[10.5px] text-foreground/50">(edited by owner)</span>}
									</td>
									<td className="px-3 py-1.5 border-b border-foreground/6 text-right text-positive">{row.direction === "in" ? formatGhs(row.amount_pesewas) : ""}</td>
									<td className="px-3 py-1.5 border-b border-foreground/6 text-right">{row.direction === "out" ? formatGhs(row.amount_pesewas) : ""}</td>
									<td className="px-3 py-1.5 border-b border-foreground/6 text-right text-foreground/60">{row.balance_after_pesewas == null ? "" : formatGhs(row.balance_after_pesewas)}</td>
								</tr>
							))}
						</tbody>
					</table>
					{allRows.length > 25 && (
						<button type="button" onClick={() => setShowAll((v) => !v)} className="w-full py-2 text-[12.5px] underline cursor-pointer">
							{showAll ? "Show fewer" : `Show all ${allRows.length} rows`}
						</button>
					)}
				</div>
			)}

			<div className="mt-5 border-t border-border pt-4">
				{decided ? (
					<div className="text-[13px]">
						<span className={`font-semibold ${item.review_status === "approved" ? "text-positive" : "text-destructive"}`}>
							{item.review_status === "approved" ? "Approved" : "Rejected"}
						</span>
						{item.reviewed_at && <span className="text-foreground/60"> on {dateTimeFormatter.format(new Date(item.reviewed_at))}</span>}
						{item.reviewer_note && <p className="m-0 mt-1 text-foreground/80">“{item.reviewer_note}”</p>}
					</div>
				) : (
					<>
						<label htmlFor="approval-note" className="block text-[12px] font-semibold mb-1.5">
							Note <span className="font-normal text-foreground/55">(the owner sees this if you reject)</span>
						</label>
						<textarea
							id="approval-note"
							value={note}
							onChange={(e) => setNote(e.target.value)}
							maxLength={1000}
							rows={3}
							placeholder="e.g. Checked the rows against pages 1 to 22, totals match."
							className="w-full rounded-[12px] border border-border bg-background px-3 py-2 text-[13.5px] resize-y"
						/>
						{item.waiting_on_owner && (
							<p className="text-[12.5px] text-foreground/60 m-0 mt-2">
								The owner hasn&apos;t checked these rows yet, so they can&apos;t be approved. You can still reject the file.
							</p>
						)}
						{resolve.isError && (
							<p className="text-[12.5px] text-destructive m-0 mt-2">
								{resolve.error instanceof ApiError ? resolve.error.message : "That didn't save. Try again."}
							</p>
						)}
						<div className="flex flex-wrap gap-2 mt-3">
							<PillButton
								variant="success"
								onClick={() => decide("approved")}
								disabled={!note.trim() || resolve.isPending || item.waiting_on_owner}
							>
								Approve, count toward readiness
							</PillButton>
							<PillButton variant="danger" onClick={() => decide("rejected")} disabled={!note.trim() || resolve.isPending}>
								Reject and tell the owner
							</PillButton>
						</div>
						{!note.trim() && <p className="text-[11.5px] text-foreground/50 m-0 mt-2">Add a note to approve or reject.</p>}
					</>
				)}
			</div>
		</section>
	);
}
