"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { UploadIcon } from "@/components/icons";
import { ApiError } from "@/lib/api";
import type { Document } from "@/lib/api-types";
import { useUploadDocument } from "@/lib/hooks/use-documents";

type UploadState = {
	id: string;
	name: string;
	status: "uploading" | "done" | "error";
	documentId?: string;
	error?: string;
	existingDocumentId?: string;
	file?: File;
};

const REDIRECT_DELAY_MS = 1_000;
const UPLOAD_COMPLETE_REDIRECT_PATH = "/documents";

function hasDocumentReviewIssue(document: Document) {
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

export function UploadDropzone({
	businessId,
	businessLoading,
	businessError,
	onRetryBusiness,
	onUploaded,
	processingDocuments,
	duplicateDocumentId,
}: {
	businessId: string | null;
	businessLoading: boolean;
	businessError: boolean;
	onRetryBusiness: () => void;
	onUploaded: () => void;
	processingDocuments: Document[];
	duplicateDocumentId?: string | null;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const upload = useUploadDocument(businessId ?? "");
	const [uploads, setUploads] = useState<UploadState[]>([]);
	const [batchIds, setBatchIds] = useState<string[]>([]);
	const [pasteOpen, setPasteOpen] = useState(false);
	const [pastedText, setPastedText] = useState("");
	const uploadReady = Boolean(businessId) && !businessLoading && !businessError;
	const batchUploads = useMemo(
		() => uploads.filter((uploadState) => batchIds.includes(uploadState.id)),
		[batchIds, uploads],
	);
	const documentsById = useMemo(
		() => new Map(processingDocuments.map((document) => [document.id, document])),
		[processingDocuments],
	);
	const batchUploadsComplete =
		batchIds.length > 0 &&
		batchUploads.length === batchIds.length &&
		batchUploads.every((uploadState) => uploadState.status === "done");
	const batchProcessingComplete =
		batchUploadsComplete &&
		batchUploads.every((uploadState) => {
			const document = uploadState.documentId
				? documentsById.get(uploadState.documentId)
				: undefined;
			if (!document || document.status !== "extracted") return false;
			return !hasDocumentReviewIssue(document);
		});
	const batchWaitingForProcessing =
		batchUploadsComplete &&
		batchUploads.some((uploadState) => {
			const document = uploadState.documentId
				? documentsById.get(uploadState.documentId)
				: undefined;
			return document === undefined || document.status === "received" || document.status === "classified";
		});

	useEffect(() => {
		// On Records the result is already in the list below; elsewhere (Home)
		// take the owner to Records so they can see it.
		if (!batchUploadsComplete || pathname === UPLOAD_COMPLETE_REDIRECT_PATH) return;

		const timer = window.setTimeout(() => {
			router.push(UPLOAD_COMPLETE_REDIRECT_PATH);
		}, REDIRECT_DELAY_MS);

		return () => window.clearTimeout(timer);
	}, [batchUploadsComplete, pathname, router]);

	function startUploads(files: File[]) {
		const nextUploads = files.map((file) => ({
			id: crypto.randomUUID(),
			name: file.name,
			status: "uploading" as const,
			file,
		}));
		setBatchIds(nextUploads.map((uploadState) => uploadState.id));
		setUploads((prev) => [...nextUploads, ...prev]);
		nextUploads.forEach(({ file, id }) => {
			void uploadOne(file, id);
		});
	}

	function submitPastedText() {
		const text = pastedText.trim();
		if (!text) return;
		const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
		startUploads([new File([text], `pasted-text-${stamp}.txt`, { type: "text/plain" })]);
		setPastedText("");
		setPasteOpen(false);
	}

	async function uploadOne(file: File, id: string) {
		if (!businessId) return;
		try {
			const result = await upload.mutateAsync(file);
			setUploads((prev) =>
				prev.map((u) =>
					u.id === id ? { ...u, status: "done", documentId: result.documentId } : u,
				),
			);
			onUploaded();
		} catch (err) {
			const message =
				err instanceof ApiError
					? err.message
					: "Something went wrong. Please try again.";
			const existingDocumentId =
				err instanceof ApiError && err.code === "DUPLICATE_DOCUMENT"
					? (err.detail as { existing_document_id?: string } | undefined)
							?.existing_document_id
					: undefined;
			setUploads((prev) =>
				prev.map((u) =>
					u.id === id
						? {
								...u,
								status: "error",
								error: message,
								existingDocumentId,
								file,
							}
						: u,
				),
			);
		}
	}

	async function replaceUpload(uploadState: UploadState) {
		if (!uploadState.existingDocumentId || !uploadState.file) return;
		setUploads((prev) =>
			prev.map((u) =>
				u.id === uploadState.id
					? { ...u, status: "uploading", error: undefined }
					: u,
			),
		);
		try {
			const result = await upload.mutateAsync({
				file: uploadState.file,
				replaceDocumentId: uploadState.existingDocumentId,
			});
			setUploads((prev) =>
				prev.map((u) =>
					u.id === uploadState.id
						? { ...u, status: "done", documentId: result.documentId }
						: u,
				),
			);
			onUploaded();
		} catch (err) {
			const message =
				err instanceof ApiError
					? err.message
					: "Could not replace the file. Please try again.";
			setUploads((prev) =>
				prev.map((u) =>
					u.id === uploadState.id
						? { ...u, status: "error", error: message }
						: u,
				),
			);
		}
	}

	return (
		<div>
			{duplicateDocumentId && (
				<div className="mb-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-[12.5px] text-foreground/75" role="status">
					You already uploaded this file. Choose a new file above to replace it.
				</div>
			)}
			<label
				className={`relative flex group bg-muted/60 items-center justify-center gap-2 border-[1.5px] border-dashed border-foreground/30 rounded-2xl p-5.5 text-foreground transition-colors ${uploadReady ? "cursor-pointer hover:border-foreground/50" : "cursor-not-allowed opacity-75"}`}
			>
				<input
					id="upload-input"
					type="file"
					multiple
					accept="application/pdf,image/jpeg,image/png,image/heic,image/webp,text/csv,text/tab-separated-values,text/plain,application/xml,text/xml,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.oasis.opendocument.spreadsheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.jpg,.jpeg,.png,.heic,.webp,.csv,.tsv,.txt,.xml,.xlsx,.xlsm,.xls,.ods,.docx"
					disabled={!uploadReady}
					className="absolute  inset-0 h-full w-full cursor-pointer opacity-0 disabled:pointer-events-none"
					onChange={(e) => {
						const files = e.target.files;
						if (files) startUploads(Array.from(files));
						e.target.value = "";
					}}
				/>
				<UploadIcon className="text-foreground/60 group-hover:text-foreground transition-all" />
				<span className="text-[13.5px] font-semibold text-foreground/60 group-hover:text-foreground transition-all">
					{businessError
						? "Upload unavailable. Your business profile couldn't be loaded"
						: uploadReady
							? "Upload a statement, receipt, photo or spreadsheet"
							: "Preparing your secure upload"}
				</span>
			</label>
			<div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-[12px] text-foreground/55">
				<span>PDF, photo, screenshot, Excel, CSV or Word.</span>
				<button
					type="button"
					disabled={!uploadReady}
					onClick={() => setPasteOpen((open) => !open)}
					className="bg-transparent border-none p-0 text-[12.5px] font-semibold text-foreground underline cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
				>
					{pasteOpen ? "Close" : "Paste MoMo SMS instead"}
				</button>
			</div>
			{pasteOpen && (
				<div className="mt-3 rounded-2xl border border-border bg-card p-3">
					<label htmlFor="paste-text" className="block text-[12.5px] font-semibold mb-1.5">
						Paste MoMo SMS, a WhatsApp message or cash book notes
					</label>
					<textarea
						id="paste-text"
						value={pastedText}
						onChange={(event) => setPastedText(event.target.value)}
						rows={6}
						placeholder={"Payment received for GHS 250.00 from KOFI ASANTE. Current Balance: GHS 1,040.00 ..."}
						className="w-full resize-y rounded-xl border border-border bg-transparent p-2.5 text-[13px] leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
					/>
					<div className="mt-2 flex justify-end">
						<button
							type="button"
							onClick={submitPastedText}
							disabled={!pastedText.trim() || !uploadReady}
							className="rounded-full bg-foreground px-4 py-2 text-[13px] text-background cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
						>
							Read this text
						</button>
					</div>
				</div>
			)}
			{businessError && (
				<button
					type="button"
					onClick={onRetryBusiness}
					className="mt-2 bg-transparent border-none p-0 text-[12.5px] font-semibold underline cursor-pointer"
				>
					Try loading your business again
				</button>
			)}

			{uploads.some((u) => u.status !== "done") && (
				<div className="mt-3">
					{uploads.filter((u) => u.status !== "done").map((u) => (
						<div
							key={u.id}
							className={`flex items-center gap-2 text-[12.5px] py-3 px-1 border-b border-border last:border-b-0 ${
								u.status === "error" ? "text-destructive" : "opacity-70"
							}`}
						>
							{u.status === "error" ? (
								<span className="w-3.5 h-3.5 shrink-0 text-destructive font-bold">
									!
								</span>
							) : (
								<span className="w-3.5 h-3.5 shrink-0">
									<span className="inline-block w-3.5 h-3.5 border-2 border-foreground/20 border-t-ink rounded-full animate-spin" />
								</span>
							)}
							<span className="truncate">{u.name}</span>
							<span className="ml-auto shrink-0">
								{u.status === "error" ? u.error : "Uploading…"}
							</span>
							{u.status === "error" && u.existingDocumentId && (
								<button
									type="button"
									onClick={() => replaceUpload(u)}
									className="shrink-0 bg-transparent border-none p-0 text-[12.5px] font-semibold underline cursor-pointer"
								>
									Replace existing
								</button>
							)}
						</div>
					))}
				</div>
			)}
			{upload.isPending ? (
				<div className="text-[12.5px] text-foreground/60 pt-3 px-1" role="status">
					Uploading. Keep this page open.
				</div>
			) : batchUploadsComplete && (
				<div className="text-[12.5px] text-foreground/60 pt-3 px-1" role="status">
					{pathname !== UPLOAD_COMPLETE_REDIRECT_PATH
						? "Uploaded. Taking you to Records…"
						: batchWaitingForProcessing
							? "Uploaded. Reading your file…"
							: batchProcessingComplete
								? "Done. Your file is in the list below."
								: "Uploaded. See the status in the list below."}
				</div>
			)}
		</div>
	);
}
