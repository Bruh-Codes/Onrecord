"use client";

import { PillButton } from "@/components/ui/PillButton";
import { Badge } from "@/components/ui/Badge";
import { DocumentsIcon } from "@/components/icons";
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

export function UploadedDocumentsList({
	documents,
	loading,
	error,
	onRetry,
}: {
	documents: Document[] | null;
	loading: boolean;
	error: string | null;
	onRetry: () => void;
}) {
	if (loading) {
		return (
			<div
				className="py-4 space-y-2.5"
				aria-busy="true"
				aria-label="Loading your documents"
			>
				{[0, 1, 2].map((i) => (
					<div key={i} className="h-[54px] rounded-xl bg-panel animate-pulse" />
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
				<div
					key={doc.id}
					className="py-3 border-b border-border flex items-center gap-3.5"
				>
					<div className="w-[34px] h-[34px] shrink-0 rounded-[10px] bg-panel flex items-center justify-center">
						<DocumentsIcon />
					</div>
					<div className="flex-1 min-w-0">
						<div className="text-sm font-semibold">
						{doc.doc_type === "other" && doc.status === "failed"
							? "Unsupported document"
							: doc.doc_type ?? "Uploaded document"}
						</div>
						<div className="text-xs opacity-60">
							{new Date(doc.created_at).toLocaleString()}
						</div>
					</div>
					<Badge tone={STATUS_TONE[doc.status]}>
						{doc.status === "failed" && doc.doc_type === "other"
							? "Not financial data"
							: STATUS_LABEL[doc.status]}
					</Badge>
				</div>
			))}
		</div>
	);
}
