"use client";

import { useState } from "react";

import { PillButton } from "@/components/ui/PillButton";
import { Badge } from "@/components/ui/Badge";
import { DocumentsIcon, TrashIcon, XIcon } from "@/components/icons";
import { DocumentRowSkeleton } from "@/components/ui/Skeleton";
import { FinancialStatementView } from "@/components/documents/FinancialStatementView";
import type { Document, DocumentStatus } from "@/lib/api-types";

const STATUS_LABEL: Record<DocumentStatus, string> = {
	received: "Uploaded-waiting to be read",
	classified: "Classified",
	extracted: "Extracted",
	reconciliation_failed: "Needs balance review",
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

function needsReview(document: Document) {
	const evidenceReview = document.quality_flags?.evidence_review as
		| { status?: string }
		| undefined;
	return Boolean(
		["pending", "warning", "error", "rejected"].includes(evidenceReview?.status ?? "") ||
		document.quality_flags?.extraction_error ||
		document.quality_flags?.processing_error ||
		Number(document.quality_flags?.financial_statement_validation_issues ?? 0) > 0 ||
		Number(document.quality_flags?.financial_statement_mapping_review_values ?? 0) > 0 ||
		Number(document.quality_flags?.financial_statement_structure_review_values ?? 0) > 0,
	);
}

function evidenceReviewMessage(document: Document): string | null {
	const review = document.quality_flags?.evidence_review as
		| { status?: string; summary?: string }
		| undefined;
	if (!review || !["pending", "warning", "error", "rejected"].includes(review.status ?? "")) return null;
	return review.summary || "This document will be reviewed before it contributes to readiness scoring.";
}

function canDelete(document: Document) {
	// Any active document can be removed, including clean extracted evidence.
	// Superseded records are historical and are not actionable in this list.
	return document.status !== "superseded";
}

const documentDateFormatter = new Intl.DateTimeFormat("en-GB", {
	dateStyle: "short",
	timeStyle: "medium",
	timeZone: "UTC",
});

export function UploadedDocumentsList({
	documents,
	loading,
	error,
	onRetry,
	onRemove,
	removingId,
}: {
	documents: Document[] | null;
	loading: boolean;
	error: string | null;
	onRetry: () => void;
	onRemove: (documentId: string) => void;
	removingId: string | null;
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
				<p className="text-[13px] text-negative m-0">{error}</p>
				<PillButton onClick={onRetry}>Try again</PillButton>
			</div>
		);
	}

	if (!documents || documents.length === 0) {
		return (
			<p className="text-[12.5px] opacity-60 py-4 m-0">
				Nothing uploaded yet-files you add above will show up here.
			</p>
		);
	}

	return (
		<div>
			{documents.map((doc) => (
				<div key={doc.id} className="border-b border-border">
				<div className="py-3 flex items-center gap-3.5">
					<div className="w-[34px] h-[34px] shrink-0 rounded-[10px] bg-panel flex items-center justify-center">
						<DocumentsIcon />
					</div>
					<div className="flex-1 min-w-0">
						<div className="text-sm font-semibold">
						{doc.filename}
						</div>
						<div className="text-xs opacity-60">
							{documentDateFormatter.format(new Date(doc.created_at))}
						</div>
						{evidenceReviewMessage(doc) && (
							<div className="text-[11px] text-negative/80 mt-1">
								{evidenceReviewMessage(doc)} Human review required before scoring.
							</div>
						)}
					</div>
					<div className="shrink-0 flex items-center gap-2">
						{doc.doc_type === "financial_statement" && doc.status === "extracted" && (
							<PillButton onClick={() => setExpandedId(expandedId === doc.id ? null : doc.id)}>
								{expandedId === doc.id ? "Hide data" : "View data"}
							</PillButton>
						)}
						<Badge tone={needsReview(doc) ? "negative" : STATUS_TONE[doc.status]}>
							{needsReview(doc)
								? "Needs review"
								: doc.status === "failed" && doc.doc_type === "other"
								? "Not financial data"
								: STATUS_LABEL[doc.status]}
						</Badge>
						{canDelete(doc) && (
							<button
								type="button"
								aria-label={`Delete ${doc.filename}`}
								title="Delete document"
								onClick={() => setPendingDelete(doc)}
								disabled={removingId === doc.id}
								className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-negative/35 text-negative transition-colors hover:bg-negative-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-negative/40 disabled:cursor-not-allowed disabled:opacity-50"
							>
								<TrashIcon />
							</button>
						)}
					</div>
				</div>
				{expandedId === doc.id && <FinancialStatementView documentId={doc.id} />}
				</div>
			))}
			{pendingDelete && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 px-4"
					role="presentation"
					onMouseDown={(event) => {
						if (event.target === event.currentTarget) setPendingDelete(null);
					}}
				>
					<div
						role="dialog"
						aria-modal="true"
						aria-labelledby="delete-document-title"
						className="relative w-full max-w-[420px] rounded-2xl border border-border bg-surface p-5 shadow-card animate-slide-in"
					>
						<button
							type="button"
							aria-label="Close confirmation"
							onClick={() => setPendingDelete(null)}
							className="absolute right-4 top-4 inline-flex h-7 w-7 items-center justify-center rounded-full text-ink/55 hover:bg-panel hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
						>
							<XIcon />
						</button>
						<h2 id="delete-document-title" className="m-0 pr-8 text-lg font-semibold">Delete document?</h2>
						<p className="mt-2 mb-5 text-sm leading-relaxed text-ink/65">
							This will remove <span className="font-semibold text-ink">{pendingDelete.filename}</span> from your active documents and update your insights. The original record is retained securely for audit purposes.
						</p>
						<div className="flex justify-end gap-2">
							<PillButton variant="secondary" onClick={() => setPendingDelete(null)}>Cancel</PillButton>
							<PillButton
								variant="danger"
								disabled={removingId === pendingDelete.id}
								onClick={() => {
									onRemove(pendingDelete.id);
									setPendingDelete(null);
								}}
							>
								{removingId === pendingDelete.id ? "Deleting..." : "Delete document"}
							</PillButton>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
