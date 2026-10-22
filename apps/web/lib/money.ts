/**
 * Money page data: totals, monthly cash flow, counterparties, categories and
 * the transaction list, all computed by the API from confirmed transactions.
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
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

export type MoneySummary = {
  earliest_on: string | null;
  latest_on: string | null;
  documents_awaiting_review: number;
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

export type TransactionQuery = {
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

export function useMoneySummary(businessId: string | null, range: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ["money-summary", businessId, range.from ?? null, range.to ?? null],
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
