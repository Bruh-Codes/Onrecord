import { useAppActions } from "@/lib/app-state";
import { formatGhs } from "@/lib/format";
import type { Counterparty } from "@/lib/api-types";

export function CounterpartyRow({ counterparty }: { counterparty: Counterparty }) {
  const { startChat } = useAppActions();
  const needsAction = counterparty.kind === "unknown";
  const displaySuffix = counterparty.display_suffix ? ` ·${counterparty.display_suffix}` : "";
  const total = counterparty.total_in_pesewas + counterparty.total_out_pesewas;

  return (
    <div className="flex items-start gap-3 py-4 border-b border-border">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-[15px] font-semibold truncate">
            {counterparty.canonical_name}
            {displaySuffix}
          </div>
          {!needsAction && (
            <span className="text-[11px] uppercase tracking-wide opacity-60">{counterparty.kind}</span>
          )}
        </div>
        <div className="text-[12.5px] opacity-60">
          {counterparty.txn_count} transaction{counterparty.txn_count === 1 ? "" : "s"} ·{" "}
          {counterparty.first_seen ? `since ${counterparty.first_seen.slice(0, 7)}` : ""}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[14px] font-semibold">{formatGhs(total)}</div>
        {needsAction ? (
          <button
            type="button"
            onClick={startChat}
            className="rounded-full text-[12.5px] px-3 py-1.5 mt-1 bg-ink text-paper border-none cursor-pointer"
          >
            Ask assistant
          </button>
        ) : (
          <div className="text-[11.5px] opacity-55 mt-1">classified</div>
        )}
      </div>
    </div>
  );
}