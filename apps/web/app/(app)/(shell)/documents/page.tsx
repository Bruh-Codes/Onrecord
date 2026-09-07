"use client";

import { useCallback, useEffect, useState } from "react";
import { DocumentChecklistRow } from "@/components/documents/DocumentChecklistRow";
import { ManualEntryPanel } from "@/components/documents/ManualEntryPanel";
import { UploadDropzone } from "@/components/documents/UploadDropzone";
import { UploadedDocumentsList } from "@/components/documents/UploadedDocumentsList";
import { useAppActions, useAppState } from "@/lib/app-state";
import { getDocumentItems } from "@/lib/derived";
import { authClient } from "@/lib/auth-client";
import { ApiError, listDocuments, type DocumentSummary } from "@/lib/api-client";

export default function DocumentsPage() {
  const state = useAppState();
  const { resolveGap } = useAppActions();
  const docItems = getDocumentItems(state);

  const { data: session } = authClient.useSession();
  const businessId = (session?.user as { businessId?: string | null } | undefined)?.businessId ?? null;

  const [documents, setDocuments] = useState<DocumentSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(() => {
    if (!businessId) return;
    listDocuments(businessId)
      .then((page) => setDocuments(page.items))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load your documents."))
      .finally(() => setLoading(false));
  }, [businessId]);

  // Effects should only synchronize with external state, not trigger a
  // render synchronously (react-hooks/set-state-in-effect) — so the retry
  // button resets loading/error itself before calling fetchDocuments;
  // the effect just kicks off the initial fetch.
  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  return (
    <div className="flex-1 min-w-0 px-4 sm:px-7 pt-6 sm:pt-7.5 pb-10 max-w-[760px]">
      <h1 className="text-[24px] sm:text-[28px] m-0 mb-1.5">Documents</h1>
      <p className="text-sm opacity-70 m-0 mb-5">
        Checked against <strong>{state.rulePack}</strong>. Missing items block this rule pack from being
        satisfied.
      </p>

      {businessId && <UploadDropzone businessId={businessId} onUploaded={refetch} />}
      <ManualEntryPanel />

      <div className="text-xs tracking-wider uppercase text-ink/45 mt-6 mb-2">Your uploads</div>
      <UploadedDocumentsList documents={documents} loading={loading} error={error} onRetry={refetch} />

      <div className="text-xs tracking-wider uppercase text-ink/45 mt-6 mb-2">Required for this rule pack</div>
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
