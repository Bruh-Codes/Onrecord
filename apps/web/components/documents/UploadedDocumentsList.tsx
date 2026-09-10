"use client";

import { useState } from "react";

import { PillButton } from "@/components/ui/PillButton";
import { Badge } from "@/components/ui/Badge";
import { DocumentsIcon } from "@/components/icons";
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
						<PillButton
							variant="danger"
							onClick={() => onRemove(doc.id)}
							disabled={removingId === doc.id}
						>
							{removingId === doc.id ? "Removing..." : "Remove"}
						</PillButton>
					</div>
				</div>
				{expandedId === doc.id && <FinancialStatementView documentId={doc.id} />}
				</div>
			))}
		</div>
	);
}
