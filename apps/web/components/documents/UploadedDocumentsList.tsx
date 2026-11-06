"use client";

import { useEffect, useRef, useState } from "react";
import { DotsThreeIcon } from "@phosphor-icons/react";

import { PillButton } from "@/components/ui/PillButton";
import { Badge } from "@/components/ui/Badge";
import { DocumentsIcon, TrashIcon, XIcon } from "@/components/icons";
import { DocumentRowSkeleton } from "@/components/ui/Skeleton";
import { FinancialStatementView } from "@/components/documents/FinancialStatementView";
import { ExtractedRowsReview } from "@/components/documents/ExtractedRowsReview";
import { aiIngest } from "@/lib/document-review";
import type { Document, DocumentStatus } from "@/lib/api-types";
import { formatGhs } from "@/lib/format";

const STATUS_LABEL: Record<DocumentStatus, string> = {
	received: "Reading",
	classified: "Reading",
	extracted: "Read",
	reconciliation_failed: "Balances don't add up",
	failed: "Couldn't be read",
	superseded: "Replaced",
};

const STATUS_TONE: Record<DocumentStatus, "positive" | "negative" | "neutral"> =
	{
		received: "neutral",
		classified: "neutral",
		extracted: "positive",
		reconciliation_failed: "negative",
		failed: "negative",
		superseded: "neutral",
	};

function isUnsupportedDocument(document: Document) {
	return document.status === "failed" && document.quality_flags?.supported === false;
}

// OnRecord is still checking the file: nothing for the owner to do yet.
function beingChecked(document: Document) {
	const review = document.quality_flags?.evidence_review as { status?: string } | undefined;
	return review?.status === "pending";
}

function needsReview(document: Document) {
	if (isUnsupportedDocument(document) || beingChecked(document)) return false;
	const evidenceReview = document.quality_flags?.evidence_review as
		| { status?: string; scoring_eligible?: boolean }
		| undefined;
	return Boolean(
		["pending", "error", "rejected"].includes(evidenceReview?.status ?? "") ||
		(evidenceReview?.status === "warning" && !evidenceReview.scoring_eligible) ||
		document.quality_flags?.extraction_error ||
		document.quality_flags?.processing_error ||
		Number(document.quality_flags?.financial_statement_validation_issues ?? 0) > 0 ||
		Number(document.quality_flags?.financial_statement_mapping_review_values ?? 0) > 0 ||
		Number(document.quality_flags?.financial_statement_structure_review_values ?? 0) > 0,
	);
}

function awaitingRowReview(document: Document) {
	return aiIngest(document)?.state === "needs_review";
}

function hasReadRows(document: Document) {
	const state = aiIngest(document)?.state;
	return state === "needs_review" || state === "confirmed";
}

function evidenceReviewMessage(document: Document): string | null {
	if (isUnsupportedDocument(document)) return null;
	if (awaitingRowReview(document)) {
		const count = aiIngest(document)?.row_count ?? 0;
		return `We read ${count} row${count === 1 ? "" : "s"}. Check them before they're added.`;
	}
	if (beingChecked(document)) return "We're checking this file. It counts once the check is done.";
	const review = document.quality_flags?.evidence_review as
		| { status?: string; summary?: string }
		| undefined;
	if (!review || !["pending", "warning", "error", "rejected"].includes(review.status ?? "")) return null;
	return review.summary || "Check this file before it counts.";
}

function isPartiallyUsable(document: Document) {
	const review = document.quality_flags?.evidence_review as
		| { status?: string; scoring_eligible?: boolean }
		| undefined;
	return review?.status === "warning" && review.scoring_eligible === true;
}

function canDelete(document: Document) {
	// Do not expose deletion while the worker is still processing the upload.
	// Once processing finishes, extracted or failed documents remain removable.
	return ["extracted", "failed", "reconciliation_failed"].includes(document.status);
}

const documentDateFormatter = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
});

export function UploadedDocumentsList({
	businessId = null,
	documents,
	loading,
	error,
	onRetry,
	onRetryProcessing,
	onRemove,
	removingId,
	retryingId,
}: {
	businessId?: string | null;
	documents: Document[] | null;
	loading: boolean;
	error: string | null;
	onRetry: () => void;
	onRetryProcessing: (documentId: string) => void;
	onRemove: (documentId: string) => void;
	removingId: string | null;
	retryingId: string | null;
}) {
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [pendingDelete, setPendingDelete] = useState<Document | null>(null);
	if (loading) {
		return (
			<div
				className="py-4"
				aria-busy="true"
				aria-label="Loading your documents"
			>
				{[0, 1, 2].map((i) => (
					<DocumentRowSkeleton key={i} />
				))}
			</div>
		);
	}

	if (error) {
		return (
			<div className="py-6 flex flex-col items-center gap-2.5 text-center">
				<p className="text-[13px] text-destructive m-0">{error}</p>
				<PillButton onClick={onRetry}>Try again</PillButton>
			</div>
		);
	}

	if (!documents || documents.length === 0) {
		return (
			<p className="text-[12.5px] opacity-60 py-4 m-0">
				Nothing uploaded yet. Files you add above will show up here.
			</p>
		);
	}

	return (
		<div>
			{documents.map((doc) => (
				<div key={doc.id} className="border-b border-border last:border-b-0">
				<div className="py-3.5">
					<div className="flex items-start gap-3">
						<div className="w-[34px] h-[34px] shrink-0 rounded-[10px] bg-muted flex items-center justify-center">
							<DocumentsIcon />
						</div>
						<div className="flex-1 min-w-0">
							<div className="truncate text-sm font-semibold" title={doc.filename}>{doc.filename}</div>
							<div className="text-xs text-foreground/55">
								{documentDateFormatter.format(new Date(doc.created_at))}
								{(doc.transaction_count ?? 0) > 0 && ` · ${doc.transaction_count} rows`}
							</div>
						</div>
						<div className="flex shrink-0 items-center gap-1">
							<Badge tone={awaitingRowReview(doc) || beingChecked(doc) ? "neutral" : needsReview(doc) ? "negative" : STATUS_TONE[doc.status]}>
								{awaitingRowReview(doc)
									? "Your turn"
									: beingChecked(doc)
									? "Being checked"
									: needsReview(doc)
									? "Needs a look"
									: isUnsupportedDocument(doc)
									? "Not financial data"
									: STATUS_LABEL[doc.status]}
							</Badge>
							{canDelete(doc) && (
								<DocumentOptions
									filename={doc.filename}
									disabled={removingId === doc.id}
									onDelete={() => setPendingDelete(doc)}
								/>
							)}
						</div>
					</div>
					<div className="mt-2.5 pl-[46px]">
						{(doc.transaction_count ?? 0) > 0 && (
							<div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
								<span><span className="text-foreground/55">In </span><span className="font-semibold tabular-nums text-positive">{formatGhs(doc.money_in_pesewas ?? 0)}</span></span>
								<span><span className="text-foreground/55">Out </span><span className="font-semibold tabular-nums">{formatGhs(doc.money_out_pesewas ?? 0)}</span></span>
							</div>
						)}
						{evidenceReviewMessage(doc) && (
							<p className={`m-0 mt-1.5 text-[12px] leading-snug ${isPartiallyUsable(doc) || awaitingRowReview(doc) || beingChecked(doc) ? "text-foreground/60" : "text-destructive"}`}>
								{isPartiallyUsable(doc) ? "Counted, with a warning: " : ""}
								{evidenceReviewMessage(doc)}
							</p>
						)}
						<div className="mt-2.5 flex flex-wrap items-center gap-2">
							{doc.status === "received" && (
								<PillButton
									onClick={() => onRetryProcessing(doc.id)}
									disabled={retryingId === doc.id}
								>
									{retryingId === doc.id ? "Trying again…" : "Try reading again"}
								</PillButton>
							)}
							{hasReadRows(doc) && (
								<PillButton
									variant={awaitingRowReview(doc) ? "primary" : "secondary"}
									onClick={() => setExpandedId(expandedId === doc.id ? null : doc.id)}
								>
									{expandedId === doc.id ? "Hide rows" : awaitingRowReview(doc) ? "Check rows" : "View rows"}
								</PillButton>
							)}
							{doc.doc_type === "financial_statement" && doc.status === "extracted" && (
								<PillButton onClick={() => setExpandedId(expandedId === doc.id ? null : doc.id)}>
									{expandedId === doc.id ? "Hide data" : "View data"}
								</PillButton>
							)}
						</div>
					</div>
				</div>
				{expandedId === doc.id && (hasReadRows(doc)
					? <ExtractedRowsReview documentId={doc.id} businessId={businessId} />
					: <FinancialStatementView documentId={doc.id} />)}
				</div>
			))}
			{pendingDelete && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 px-4"
					role="presentation"
					onMouseDown={(event) => {
						if (event.target === event.currentTarget) setPendingDelete(null);
					}}
				>
					<div
						role="dialog"
						aria-modal="true"
						aria-labelledby="delete-document-title"
						className="relative w-full max-w-[420px] rounded-2xl border border-border bg-card p-5 shadow-card animate-slide-in"
					>
						<button
							type="button"
							aria-label="Close confirmation"
							onClick={() => setPendingDelete(null)}
							className="absolute right-4 top-4 inline-flex h-7 w-7 items-center justify-center rounded-full text-foreground/55 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
						>
							<XIcon />
						</button>
						<h2 id="delete-document-title" className="m-0 pr-8 text-lg font-semibold">Delete this file?</h2>
						<p className="mt-2 mb-5 text-sm leading-relaxed text-foreground/65">
							<span className="font-semibold text-foreground">{pendingDelete.filename}</span> and its rows will be taken out of your record, and your numbers will update.
						</p>
						<div className="flex justify-end gap-2">
							<PillButton variant="secondary" onClick={() => setPendingDelete(null)}>Keep it</PillButton>
							<PillButton
								variant="danger"
								disabled={removingId === pendingDelete.id}
								onClick={() => {
									onRemove(pendingDelete.id);
									setPendingDelete(null);
								}}
							>
								{removingId === pendingDelete.id ? "Deleting…" : "Delete file"}
							</PillButton>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

/** "⋯" menu for an upload, so Delete is one step away and never tapped by accident. */
function DocumentOptions({ filename, disabled, onDelete }: { filename: string; disabled: boolean; onDelete: () => void }) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (event: MouseEvent) => {
			if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false);
		};
		document.addEventListener("mousedown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("mousedown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open]);

	return (
		<div ref={ref} className="relative">
			<button
				type="button"
				aria-label={`Options for ${filename}`}
				aria-haspopup="menu"
				aria-expanded={open}
				disabled={disabled}
				onClick={() => setOpen((value) => !value)}
				className="inline-flex h-8 w-8 items-center justify-center rounded-full text-foreground/60 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 disabled:opacity-50"
			>
				<DotsThreeIcon size={20} weight="bold" />
			</button>
			{open && (
				<div role="menu" className="absolute right-0 top-full z-40 mt-1 min-w-[150px] rounded-xl border border-border bg-card p-1 shadow-lg">
					<button
						type="button"
						role="menuitem"
						onClick={() => {
							setOpen(false);
							onDelete();
						}}
						className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-destructive hover:bg-destructive-background"
					>
						<TrashIcon className="h-3.5 w-3.5" />
						Delete file
					</button>
				</div>
			)}
		</div>
	);
}
