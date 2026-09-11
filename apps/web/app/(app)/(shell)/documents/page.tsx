"use client";

import { useState } from "react";
import { UploadDropzone } from "@/components/documents/UploadDropzone";
import { UploadedDocumentsList } from "@/components/documents/UploadedDocumentsList";
import {
	useDeleteDocument,
	useDocuments,
	useMe,
} from "@/lib/hooks/use-business";

export default function DocumentsPage() {
	const me = useMe();
	const { businessId } = me;
	const documents = useDocuments(businessId);
	const deleteDocument = useDeleteDocument(businessId);
	const [removingId, setRemovingId] = useState<string | null>(null);
	async function removeDocument(documentId: string) {
		setRemovingId(documentId);
		try {
			await deleteDocument.mutateAsync(documentId);
		} finally {
			setRemovingId(null);
		}
	}

	return (
		<div className="flex-1 min-w-0 px-4 sm:px-7 pt-6 sm:pt-7.5 pb-10 max-w-[760px]">
			<h1 className="text-[24px] sm:text-[28px] m-0 mb-1.5">Documents</h1>
			<p className="text-sm opacity-70 m-0 mb-5">
				Upload financial documents and we&apos;ll extract the information needed
				for your readiness profile.
			</p>

			<UploadDropzone
				businessId={businessId}
				businessLoading={me.isLoading}
				businessError={me.isError}
				onRetryBusiness={() => me.refetch()}
				onUploaded={() => documents.refetch()}
				processingDocuments={documents.data?.items ?? []}
			/>

			{(documents.data?.items?.length ?? 0) > 0 && (
				<section className="mt-6">
					<div className="text-xs tracking-wider uppercase text-foreground/45 mb-2">
						Your uploads
					</div>
					<UploadedDocumentsList
						documents={documents.data?.items ?? null}
						loading={documents.isLoading}
						error={documents.isError ? "Couldn't load your documents." : null}
						onRetry={() => documents.refetch()}
						onRemove={removeDocument}
						removingId={removingId}
					/>
				</section>
			)}
		</div>
	);
}
