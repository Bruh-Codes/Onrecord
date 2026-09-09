"use client";

import { useState } from "react";
import { DocumentChecklistRow } from "@/components/documents/DocumentChecklistRow";
import { ManualEntryPanel } from "@/components/documents/ManualEntryPanel";
import { UploadDropzone } from "@/components/documents/UploadDropzone";
import { UploadedDocumentsList } from "@/components/documents/UploadedDocumentsList";
import { useAppState } from "@/lib/app-state";
import { api } from "@/lib/api";
import type { ChecklistItem } from "@/lib/api-types";
import { useChecklist, useDocuments, useMe } from "@/lib/hooks/use-business";

const DOC_LABELS: Record<string, string> = {
  bank_statement: "Bank statements",
  momo_statement: "Mobile money statements",
  registration_cert: "Business registration certificate",
  tin_card: "TIN / Ghana Card",
  tenancy_agreement: "Tenancy agreement",
  stock_list: "Current stock list",
};

const REQUIRED_LABELS: Record<string, string> = {
  required: "Required for this rule pack",
  optional: "Optional for this facility",
  conditional: "Conditional requirement",
};

function toDocItems(checklist: ChecklistItem[]) {
  return checklist.map((item) => {
    const satisfied = item.status === "satisfied";
    const isNA = item.status === "not_applicable";
    return {
      key: item.doc_type,
      label: DOC_LABELS[item.doc_type] ?? item.doc_type.replace(/_/g, " "),
      detail: REQUIRED_LABELS[item.requirement] ?? item.requirement,
      done: satisfied || isNA,
      static: isNA,
      actionLabel: satisfied || isNA ? undefined : "Upload",
    };
  });
}

export default function DocumentsPage() {
  const state = useAppState();
  const me = useMe();
  const { businessId } = me;
  const { data: checklist, isLoading } = useChecklist(businessId);
	const documents = useDocuments(businessId);
	const [removingId, setRemovingId] = useState<string | null>(null);
  const docItems = toDocItems(checklist ?? []);

	function focusUpload() {
    document.getElementById("upload-input")?.click();
	}

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
        Checked against <strong>{state.rulePack}</strong>. Missing items block this rule pack from being satisfied.
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

      <div className="text-xs tracking-wider uppercase text-ink/45 mt-6 mb-2">Required for this rule pack</div>
      {isLoading && <p className="text-sm opacity-60">Preparing your document checklist…</p>}
      {docItems.map((doc) => (
        <DocumentChecklistRow key={doc.key} doc={doc} onResolve={focusUpload} />
      ))}
      {!isLoading && docItems.length === 0 && (
        <p className="text-sm opacity-60">Your checklist will appear after your first document is processed.</p>
      )}
    </div>
  );
}
