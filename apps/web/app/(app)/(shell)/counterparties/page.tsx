"use client";

import { CounterpartyRow } from "@/components/counterparties/CounterpartyRow";
import { useCounterparties, useMe } from "@/lib/hooks/use-business";
import { CounterpartyRowSkeleton } from "@/components/ui/Skeleton";

export default function CounterpartiesPage() {
  const { businessId } = useMe();
  const { data: counterparties, isLoading } = useCounterparties(businessId);

  return (
    <div className="flex-1 min-w-0 px-4 sm:px-7 pt-6 sm:pt-7.5 pb-10 max-w-[820px]">
      <h1 className="text-[24px] sm:text-[28px] m-0 mb-1.5">Counterparties</h1>
      <p className="text-sm opacity-70 m-0 mb-6.5">
        Classify a counterparty once and every transaction with them follows.
      </p>
      {isLoading && <div aria-busy="true" aria-label="Loading counterparties"><CounterpartyRowSkeleton /><CounterpartyRowSkeleton /><CounterpartyRowSkeleton /></div>}
      {(counterparties?.items ?? []).map((c) => (
        <CounterpartyRow key={c.id} counterparty={c} />
      ))}
      {!isLoading && (counterparties?.items ?? []).length === 0 && (
        <p className="text-sm opacity-60">No counterparties found yet.</p>
      )}
    </div>
  );
}
