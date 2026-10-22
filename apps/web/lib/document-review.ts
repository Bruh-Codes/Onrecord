/**
 * Rows the AI reader took from a document, and the owner's review of them.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "@/lib/api";
import type { Document } from "@/lib/api-types";

export type ExtractedRow = {
  id: string;
  occurred_on: string;
  description: string;
  counterparty: string | null;
  reference: string | null;
  direction: "in" | "out";
  amount_pesewas: number;
  fee_pesewas: number;
  levy_pesewas: number;
  balance_after_pesewas: number | null;
  category_l1: string;
  page: number;
  source_ref: string;
  excluded: boolean;
  corrected: boolean;
};

export type Reconciliation = {
  status: "reconciled" | "balance_breaks" | "unverifiable";
  rows_with_balance: number;
  balance_breaks: number;
  opening_closing_matches: boolean | null;
  note: string;
};

export type ExtractedRows = {
  document_id: string;
  state: "needs_review" | "confirmed" | "no_transactions" | "failed" | "none";
  summary: string;
  findings: string[];
  reconciliation: Reconciliation | null;
  confidence: number | null;
  model: string | null;
  rows: ExtractedRow[];
};

export type RowDecision = {
  id: string;
  include?: boolean;
  direction?: "in" | "out";
  amount_pesewas?: number;
  occurred_on?: string;
  category_l1?: string;
};

export type AiIngestMeta = {
  state?: ExtractedRows["state"];
  summary?: string;
  row_count?: number;
  reconciliation?: Reconciliation;
  transactions_created?: number;
  duplicates_skipped?: number;
};

export const CATEGORY_LABELS: Record<string, string> = {
  revenue: "Sales",
  cogs: "Stock & inputs",
  opex: "Running costs",
  tax: "Tax",
  financing_in: "Loan received",
  financing_out: "Loan repayment",
  owner: "Owner",
  internal: "Own transfer",
  unknown: "Not sure",
};

export function aiIngest(document: Document): AiIngestMeta | null {
  const value = document.quality_flags?.ai_ingest;
  return value && typeof value === "object" ? (value as AiIngestMeta) : null;
}

export function useExtractedRows(documentId: string | null) {
  return useQuery({
    queryKey: ["extracted-rows", documentId],
    queryFn: () => request<ExtractedRows>(`/v1/documents/${documentId}/extracted-rows`),
    enabled: Boolean(documentId),
  });
}

export function useConfirmRows(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId, rows }: { documentId: string; rows: RowDecision[] }) =>
      request<{ transactions_created: number; duplicates_skipped: number }>(
        `/v1/documents/${documentId}/extracted-rows/confirm`,
        { method: "POST", body: JSON.stringify({ rows }) },
      ),
    onSuccess: (_, { documentId }) => {
      for (const key of ["documents", "transactions", "indicators", "score", "coverage", "gaps", "notifications"]) {
        qc.invalidateQueries({ queryKey: [key, businessId] });
      }
      qc.invalidateQueries({ queryKey: ["extracted-rows", documentId] });
    },
  });
}
