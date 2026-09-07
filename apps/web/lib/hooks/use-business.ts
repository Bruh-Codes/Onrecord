/**
 * React-Query hooks backed by apps/api.
 *
 * Business discovery goes through GET /v1/me which resolves ownership from the
 * Better Auth row (source of truth, falling back to the JWT claim). This
 * handles the case where a business was created after the session was signed
 * (JWT claim stale until refresh).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";
import type {
  Business,
  ChecklistItem,
  Coverage,
  Document,
  Gap,
  Indicator,
  Me,
  ReadinessScore,
  Counterparty,
  Transaction,
} from "@/lib/api-types";

function useSessionToken(): string | null {
  const { data: session } = authClient.useSession();
  return session?.session?.token ?? null;
}

/** Current authenticated user + business. Resolved from the auth row, not the
 *  stale JWT claim. */
export function useMe() {
  const token = useSessionToken();
  const query = useQuery<Me>({
    queryKey: ["me"],
    queryFn: api.me,
    enabled: !!token,
  });
  return { ...query, businessId: query.data?.business_id ?? null };
}

export function useBusiness(businessId: string | null) {
  return useQuery<Business>({
    queryKey: ["business", businessId],
    queryFn: () => api.getBusiness(businessId!),
    enabled: !!businessId,
  });
}

export function useCoverage(businessId: string | null) {
  return useQuery<Coverage>({
    queryKey: ["coverage", businessId],
    queryFn: () => api.getCoverage(businessId!),
    enabled: !!businessId,
  });
}

export function useIndicators(businessId: string | null) {
  return useQuery<Indicator[]>({
    queryKey: ["indicators", businessId],
    queryFn: () => api.listIndicators(businessId!),
    enabled: !!businessId,
  });
}

export function useScore(businessId: string | null) {
  return useQuery<ReadinessScore>({
    queryKey: ["score", businessId],
    queryFn: () => api.getScore(businessId!),
    enabled: !!businessId,
    retry: false,
  });
}

export function useChecklist(businessId: string | null, rulePack = "gh_mfi_working_capital_v1") {
  return useQuery<ChecklistItem[]>({
    queryKey: ["checklist", businessId, rulePack],
    queryFn: () => api.getChecklist(businessId!, rulePack),
    enabled: !!businessId,
  });
}

export function useGaps(businessId: string | null) {
  return useQuery<Gap[]>({
    queryKey: ["gaps", businessId],
    queryFn: () => api.listGaps(businessId!),
    enabled: !!businessId,
  });
}

export function useCounterparties(businessId: string | null) {
  return useQuery<Counterparty[]>({
    queryKey: ["counterparties", businessId],
    queryFn: () => api.listCounterparties(businessId!),
    enabled: !!businessId,
  });
}

export function useDocuments(businessId: string | null) {
  return useQuery<{ items: Document[]; total: number }>({
    queryKey: ["documents", businessId],
    queryFn: () => api.listDocuments(businessId!),
    enabled: !!businessId,
  });
}

export function useTransactions(businessId: string | null, params?: Record<string, string | number>) {
  const key = JSON.stringify(params ?? {});
  return useQuery<{ items: Transaction[]; total: number }>({
    queryKey: ["transactions", businessId, key],
    queryFn: () => api.listTransactions(businessId!, params),
    enabled: !!businessId,
  });
}

export function useWaiveGap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ gapId, reason }: { gapId: string; reason: string }) =>
      api.waiveGap(gapId, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gaps"] }),
  });
}

export function useRecompute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (businessId: string) => api.recompute(businessId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["score"] });
      qc.invalidateQueries({ queryKey: ["coverage"] });
      qc.invalidateQueries({ queryKey: ["indicators"] });
      qc.invalidateQueries({ queryKey: ["checklist"] });
      qc.invalidateQueries({ queryKey: ["gaps"] });
    },
  });
}

/** Poll a recompute task until done. */
export function useTask(taskId: string | null) {
  return useQuery({
    queryKey: ["task", taskId],
    queryFn: () => api.getTask(taskId!),
    enabled: !!taskId,
    refetchInterval: (q) =>
      q.state.data?.state === "PENDING" || q.state.data?.state === "STARTED" ? 1000 : false,
  });
}

/** Indicators as a map keyed by code for easy lookup. */
export function useIndicatorsMap(businessId: string | null) {
  const q = useIndicators(businessId);
  const map = useMemo(() => {
    const m: Record<string, Indicator> = {};
    for (const ind of q.data ?? []) {
      m[ind.code] = ind;
    }
    return m;
  }, [q.data]);
  return { ...q, map };
}