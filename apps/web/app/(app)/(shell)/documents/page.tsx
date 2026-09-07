"use client";

import { DocumentChecklistRow } from "@/components/documents/DocumentChecklistRow";
import { ManualEntryPanel } from "@/components/documents/ManualEntryPanel";
import { UploadDropzone } from "@/components/documents/UploadDropzone";
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
  const { businessId } = useMe();
  const { data: checklist, isLoading } = useChecklist(businessId);
  const { data: documents } = useDocuments(businessId);
  const docItems = toDocItems(checklist ?? []);
  const uploadedCount = documents?.items.length ?? 0;

  function focusUpload() {
    document.getElementById("upload-input")?.click();
  }

  return (
    <div className="flex-1 min-w-0 px-7 pt-7.5 pb-10 max-w-[760px]">
      <h1 className="text-[28px] m-0 mb-1.5">Documents</h1>
      <p className="text-sm opacity-70 m-0 mb-5">
        Checked against <strong>{state.rulePack}</strong>. Missing items block this rule pack from being
        satisfied.
      </p>

      <UploadDropzone />
      <ManualEntryPanel />

      {uploadedCount > 0 && (
        <div className="text-[12.5px] opacity-70 mb-2">{uploadedCount} document(s) uploaded</div>
      )}

      <div className="text-xs tracking-wider uppercase text-ink/45 my-2">Required for this rule pack</div>
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