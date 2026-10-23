/**
 * Money page data: totals, monthly cash flow, counterparties, categories and
 * the transaction list, all computed by the API from confirmed transactions.
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "@/lib/api";

export type CashFlowPeriod = {
  period: string;
  money_in_pesewas: number;
  money_out_pesewas: number;
  net_pesewas: number;
  transactions: number;
};

export type Counterparty = {
  name: string;
  transactions: number;
  amount_pesewas: number;
  share_of_total: string | null;
  last_on: string;
};

export type CategoryTotal = {
  category: string;
  transactions: number;
  amount_pesewas: number;
  share: string | null;
};

export type FarmGroup = {
  farm_activity: string | null;
  season: string | null;
  money_in_pesewas: number;
  money_out_pesewas: number;
  left_over_pesewas: number;
  transactions: number;
  typed_in_by_owner: number;
  first_on: string;
  last_on: string;
};

export type MoneySummary = {
  earliest_on: string | null;
  latest_on: string | null;
  documents_awaiting_review: number;
  // Optional: an API deployed before the crop/season release doesn't send these.
  example_season_available?: boolean;
  farm?: {
    groups: FarmGroup[];
    untagged: { money_in_pesewas: number; money_out_pesewas: number; transactions: number };
  };
  farm_tags?: { activities: string[]; seasons: string[] };
  cash_flow: { periods: CashFlowPeriod[]; best_period: string | null; worst_period: string | null };
  top_customers: { counterparties: Counterparty[] };
  top_suppliers: { counterparties: Counterparty[] };
  categories: { money_in: CategoryTotal[]; money_out: CategoryTotal[] };
};

export type MoneyTransaction = {
  id: string;
  occurred_on: string;
  direction: "in" | "out";
  amount_pesewas: number;
  fee_pesewas: number;
  balance_after_pesewas: number | null;
  category_l1: string | null;
  category_l2: string | null;
  farm_activity: string | null;
  season: string | null;
  hand_entered: boolean;
  counterparty: string | null;
  description: string | null;
  document_name: string | null;
  internal_transfer: boolean;
};

export type TransactionPage = {
  matches: number;
  money_in_pesewas: number;
  money_out_pesewas: number;
  offset: number;
  items: MoneyTransaction[];
};

/** Narrow everything on the Money page to one crop/animal and/or season. */
export type FarmFilter = { farm_activity?: string; season?: string };

export type TransactionQuery = FarmFilter & {
  q?: string;
  direction?: "in" | "out";
  category?: string;
  from?: string;
  to?: string;
  sort?: "newest" | "oldest" | "largest";
  limit?: number;
};

function query(params: Record<string, string | number | undefined>) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== "");
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}` : "";
}

export function useMoneySummary(businessId: string | null, range: { from?: string; to?: string } & FarmFilter) {
  return useQuery({
    queryKey: ["money-summary", businessId, range.from ?? null, range.to ?? null, range.farm_activity ?? null, range.season ?? null],
    queryFn: () => request<MoneySummary>(`/v1/businesses/${businessId}/money/summary${query(range)}`),
    enabled: Boolean(businessId),
    placeholderData: keepPreviousData,
  });
}

export function useMoneyTransactions(businessId: string | null, params: TransactionQuery) {
  return useQuery({
    queryKey: ["money-transactions", businessId, params],
    queryFn: () => request<TransactionPage>(`/v1/businesses/${businessId}/money/transactions${query(params)}`),
    enabled: Boolean(businessId),
    placeholderData: keepPreviousData,
  });
}

export type NewRecord = {
  direction: "in" | "out";
  occurred_on: string;
  amount_pesewas: number;
  category: string;
  description?: string;
  counterparty?: string;
  farm_activity?: string;
  season?: string;
};

export function useRecordCategories() {
  return useQuery({
    queryKey: ["record-categories"],
    queryFn: () => request<{ in: string[]; out: string[] }>("/v1/money/record-categories"),
    staleTime: Infinity,
  });
}

/** Every page that reads transactions, refreshed after a record changes. */
function useRefreshRecords(businessId: string | null) {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      ["money-summary", "money-transactions", "transactions", "documents", "indicators", "score", "coverage", "gaps"].map((key) =>
        qc.invalidateQueries({ queryKey: [key, businessId] }),
      ),
    );
}

export function useAddRecord(businessId: string | null) {
  const refresh = useRefreshRecords(businessId);
  return useMutation({
    mutationFn: (record: NewRecord) =>
      request<{ id: string }>(`/v1/businesses/${businessId}/money/records`, { method: "POST", body: JSON.stringify(record) }),
    onSuccess: refresh,
  });
}

export function useTagRecord(businessId: string | null) {
  const refresh = useRefreshRecords(businessId);
  return useMutation({
    mutationFn: ({ id, ...tags }: { id: string; farm_activity: string; season: string }) =>
      request(`/v1/transactions/${id}`, { method: "PATCH", body: JSON.stringify(tags) }),
    onSuccess: refresh,
  });
}

export function useRemoveRecord(businessId: string | null) {
  const refresh = useRefreshRecords(businessId);
  return useMutation({
    mutationFn: (id: string) => request(`/v1/transactions/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
}

export function useExampleSeason(businessId: string | null) {
  const refresh = useRefreshRecords(businessId);
  return useMutation({
    mutationFn: () => request<{ added: number }>(`/v1/businesses/${businessId}/money/example-season`, { method: "POST" }),
    onSuccess: refresh,
  });
}

/** First day of the month `months - 1` months before `latest` (YYYY-MM-DD). */
export function rangeStart(latest: string, months: number): string {
  const [year, month] = latest.split("-").map(Number);
  const index = year * 12 + (month - 1) - (months - 1);
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-01`;
}

const monthFormatter = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const monthYearFormatter = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export function monthLabel(period: string, long = false): string {
  const date = new Date(`${period}-01T00:00:00Z`);
  return (long ? monthYearFormatter : monthFormatter).format(date);
}

export function compactGhs(pesewas: number): string {
  const cedis = Math.abs(pesewas) / 100;
  const sign = pesewas < 0 ? "-" : "";
  if (cedis >= 1_000_000) return `${sign}GH¢${(cedis / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  if (cedis >= 1_000) return `${sign}GH¢${(cedis / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${sign}GH¢${Math.round(cedis)}`;
}
