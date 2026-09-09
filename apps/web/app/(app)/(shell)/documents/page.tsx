"use client";

import { useState } from "react";
import { ManualEntryPanel } from "@/components/documents/ManualEntryPanel";
import { UploadDropzone } from "@/components/documents/UploadDropzone";
import { UploadedDocumentsList } from "@/components/documents/UploadedDocumentsList";
import { api } from "@/lib/api";
import { useDocuments, useMe } from "@/lib/hooks/use-business";

export default function DocumentsPage() {
  const me = useMe();
  const { businessId } = me;
	const documents = useDocuments(businessId);
	const [removingId, setRemovingId] = useState<string | null>(null);
	async function removeDocument(documentId: string) {
		setRemovingId(documentId);
		try {
			await api.deleteDocument(documentId);
			await documents.refetch();
		} finally {
			setRemovingId(null);
		}
	}

  return (
    <div className="flex-1 min-w-0 px-4 sm:px-7 pt-6 sm:pt-7.5 pb-10 max-w-[760px]">
      <h1 className="text-[24px] sm:text-[28px] m-0 mb-1.5">Documents</h1>
      <p className="text-sm opacity-70 m-0 mb-5">
        Upload financial documents and we&apos;ll extract the information needed for your readiness profile.
      </p>

      <UploadDropzone
        businessId={businessId}
        businessLoading={me.isLoading}
        businessError={me.isError}
        onRetryBusiness={() => me.refetch()}
        onUploaded={() => documents.refetch()}
      />
      <ManualEntryPanel />

      {(documents.data?.items?.length ?? 0) > 0 && (
        <section className="mt-6">
          <div className="text-xs tracking-wider uppercase text-ink/45 mb-2">Your uploads</div>
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
