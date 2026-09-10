"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, UploadIcon } from "@/components/icons";
import { ApiError } from "@/lib/api";
import { useUploadDocument } from "@/lib/hooks/use-documents";

type UploadState = {
	id: string;
	name: string;
	status: "uploading" | "done" | "error";
	error?: string;
	existingDocumentId?: string;
	file?: File;
};

const REDIRECT_DELAY_MS = 3_000;
const UPLOAD_COMPLETE_REDIRECT_PATH = "/overview";

export function UploadDropzone({
	businessId,
	businessLoading,
	businessError,
	onRetryBusiness,
	onUploaded,
}: {
	businessId: string | null;
	businessLoading: boolean;
	businessError: boolean;
	onRetryBusiness: () => void;
	onUploaded: () => void;
}) {
	const router = useRouter();
	const upload = useUploadDocument(businessId ?? "");
	const [uploads, setUploads] = useState<UploadState[]>([]);
	const [batchIds, setBatchIds] = useState<string[]>([]);
	const uploadReady = Boolean(businessId) && !businessLoading && !businessError;
	const batchUploads = useMemo(
		() => uploads.filter((uploadState) => batchIds.includes(uploadState.id)),
		[batchIds, uploads],
	);
	const batchComplete =
		batchIds.length > 0 &&
		batchUploads.length === batchIds.length &&
		batchUploads.every((uploadState) => uploadState.status === "done");

	useEffect(() => {
		if (!batchComplete) return;

		const timer = window.setTimeout(() => {
			router.push(UPLOAD_COMPLETE_REDIRECT_PATH);
		}, REDIRECT_DELAY_MS);

		return () => window.clearTimeout(timer);
	}, [batchComplete, router]);

	async function uploadOne(file: File, id: string) {
		if (!businessId) return;
		try {
			await upload.mutateAsync(file);
			setUploads((prev) =>
				prev.map((u) => (u.id === id ? { ...u, status: "done" } : u)),
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
						? { ...u, status: "error", error: message, existingDocumentId, file }
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
			await upload.mutateAsync({
				file: uploadState.file,
				replaceDocumentId: uploadState.existingDocumentId,
			});
			setUploads((prev) =>
				prev.map((u) => (u.id === uploadState.id ? { ...u, status: "done" } : u)),
			);
			onUploaded();
		} catch (err) {
			const message = err instanceof ApiError ? err.message : "Could not replace the file. Please try again.";
			setUploads((prev) =>
				prev.map((u) =>
					u.id === uploadState.id ? { ...u, status: "error", error: message } : u,
				),
			);
		}
	}

	return (
		<div>
			<label
				className={`relative flex items-center justify-center gap-2 border-[1.5px] border-dashed border-ink/30 rounded-2xl p-5.5 text-ink transition-colors ${uploadReady ? "cursor-pointer hover:border-ink/50" : "cursor-not-allowed opacity-75"}`}
			>
				<input
					id="upload-input"
					type="file"
					multiple
					accept="application/pdf,image/jpeg,image/png,image/heic,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.pdf,.jpg,.jpeg,.png,.heic,.csv,.xlsx"
					disabled={!uploadReady}
					className="absolute inset-0 h-full w-full cursor-inherit opacity-0 disabled:pointer-events-none"
					onChange={(e) => {
						const files = e.target.files;
						if (files) {
							const nextUploads = Array.from(files).map((file) => ({
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
						e.target.value = "";
					}}
				/>
				<UploadIcon />
				<span className="text-[13.5px] font-semibold">
					{businessError
						? "Upload unavailable-your business profile could not be loaded"
						: uploadReady
						? "Upload any file-statement, receipt, or a photo of a ledger page"
						: "Preparing your secure upload"}
				</span>
			</label>
			<div className="mt-2 px-1 text-[12px] text-ink/55">
				Supported formats: PDF, JPG/JPEG, PNG, HEIC, CSV, XLSX
			</div>
			{businessError && (
				<button
					type="button"
					onClick={onRetryBusiness}
					className="mt-2 bg-transparent border-none p-0 text-[12.5px] font-semibold underline cursor-pointer"
				>
					Try loading your business again
				</button>
			)}

			{uploads.length > 0 && (
				<div className="mb-3">
					{uploads.map((u) => (
						<div
							key={u.id}
							className={`flex items-center gap-2 text-[12.5px] py-3 px-1 border-b border-border last:border-b-0 ${
								u.status === "error"
									? "text-negative"
									: u.status === "done"
										? "text-positive"
										: "opacity-70"
							}`}
						>
							{u.status === "done" ? (
								<CheckIcon className="shrink-0" />
							) : u.status === "error" ? (
								<span className="w-3.5 h-3.5 shrink-0 text-negative font-bold">
									!
								</span>
							) : (
								<span className="w-3.5 h-3.5 shrink-0">
									<span className="inline-block w-3.5 h-3.5 border-2 border-ink/20 border-t-ink rounded-full animate-spin" />
								</span>
							)}
							<span className="truncate">{u.name}</span>
							<span className="ml-auto shrink-0">
								{u.status === "done"
									? "uploaded-queued for classification"
									: u.status === "error"
										? u.error
										: "processing…"}
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
			{batchComplete && (
				<div className="text-[12.5px] text-positive pt-3 px-1" role="status">
					All files uploaded. Taking you to the overview in 3 seconds…
				</div>
			)}
			{upload.isPending && (
				<div className="text-[12.5px] opacity-60 pt-3 px-1">
					Keep this page open while your files upload.
				</div>
			)}
		</div>
	);
}
