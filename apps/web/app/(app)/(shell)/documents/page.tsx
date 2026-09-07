"use client";

import { DocumentChecklistRow } from "@/components/documents/DocumentChecklistRow";
import { ManualEntryPanel } from "@/components/documents/ManualEntryPanel";
import { UploadDropzone } from "@/components/documents/UploadDropzone";
import { UploadedDocumentsList } from "@/components/documents/UploadedDocumentsList";
import { useAppState } from "@/lib/app-state";
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
  const { businessId, data: me } = useMe();
  const { data: checklist, isLoading } = useChecklist(businessId);
  const documents = useDocuments(businessId);
  const docItems = toDocItems(checklist ?? []);
  const resolvedBusinessId = businessId ?? (me?.business as { id?: string } | null)?.id ?? null;

  function focusUpload() {
    document.getElementById("upload-input")?.click();
  }

  return (
    <div className="flex-1 min-w-0 px-4 sm:px-7 pt-6 sm:pt-7.5 pb-10 max-w-[760px]">
      <h1 className="text-[24px] sm:text-[28px] m-0 mb-1.5">Documents</h1>
      <p className="text-sm opacity-70 m-0 mb-5">
        Checked against <strong>{state.rulePack}</strong>. Missing items block this rule pack from being
        satisfied.
      </p>

      {resolvedBusinessId && (
        <UploadDropzone businessId={resolvedBusinessId} onUploaded={() => documents.refetch()} />
      )}
      <ManualEntryPanel />

      <div className="text-xs tracking-wider uppercase text-ink/45 mt-6 mb-2">Your uploads</div>
      <UploadedDocumentsList
        documents={documents.data?.items ?? null}
        loading={documents.isLoading}
        error={documents.isError ? "Couldn't load your documents." : null}
        onRetry={() => documents.refetch()}
      />

      <div className="text-xs tracking-wider uppercase text-ink/45 mt-6 mb-2">Required for this rule pack</div>
      {isLoading && <p className="text-sm opacity-60">Loading checklist…</p>}
      {docItems.map((doc) => (
        <DocumentChecklistRow key={doc.key} doc={doc} onResolve={focusUpload} />
      ))}
      {!isLoading && docItems.length === 0 && (
        <p className="text-sm opacity-60">Run a recompute to generate the document checklist.</p>
      )}
    </div>
  );
}