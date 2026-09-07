"use client";

import { CounterpartyRow } from "@/components/counterparties/CounterpartyRow";
import { useCounterparties, useMe } from "@/lib/hooks/use-business";

export default function CounterpartiesPage() {
  const { businessId } = useMe();
  const { data: counterparties, isLoading } = useCounterparties(businessId);

  return (
    <div className="flex-1 min-w-0 px-7 pt-7.5 pb-10 max-w-[820px]">
      <h1 className="text-[28px] m-0 mb-1.5">Counterparties</h1>
      <p className="text-sm opacity-70 m-0 mb-6.5">
        Classify a counterparty once and every transaction with them follows.
      </p>
      {isLoading && <p className="text-sm opacity-60">Loading…</p>}
      {(counterparties ?? []).map((c) => (
        <CounterpartyRow key={c.id} counterparty={c} />
      ))}
      {!isLoading && (counterparties ?? []).length === 0 && (
        <p className="text-sm opacity-60">No counterparties found yet.</p>
      )}
    </div>
  );
}