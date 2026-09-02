"use client";

import { DocumentChecklistRow } from "@/components/documents/DocumentChecklistRow";
import { ManualEntryPanel } from "@/components/documents/ManualEntryPanel";
import { UploadDropzone } from "@/components/documents/UploadDropzone";
import { useAppActions, useAppState } from "@/lib/app-state";
import { getDocumentItems } from "@/lib/derived";

export default function DocumentsPage() {
  const state = useAppState();
  const { resolveGap } = useAppActions();
  const docItems = getDocumentItems(state);

  return (
    <div className="flex-1 min-w-0 px-7 pt-7.5 pb-10 max-w-[760px]">
      <h1 className="text-[28px] m-0 mb-1.5">Documents</h1>
      <p className="text-sm opacity-70 m-0 mb-5">
        Checked against <strong>{state.rulePack}</strong>. Missing items block this rule pack from being
        satisfied.
      </p>

      <UploadDropzone />
      <ManualEntryPanel />

      <div className="text-xs tracking-wider uppercase text-ink/45 my-2">Required for this rule pack</div>
      {docItems.map((doc) => (
        <DocumentChecklistRow
          key={doc.label}
          doc={doc}
          onResolve={() => doc.key && resolveGap(doc.key)}
        />
      ))}
    </div>
  );
}
