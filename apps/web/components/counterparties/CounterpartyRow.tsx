"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { ChevronDownIcon } from "@/components/icons";
import { PillButton } from "@/components/ui/PillButton";
import { useAppActions } from "@/lib/app-state";
import type { Counterparty } from "@/lib/types";

export function CounterpartyRow({ counterparty }: { counterparty: Counterparty }) {
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();
  const { classifyAdom, classifyOneOff, undoAdom, undoOneOff, startChat } = useAppActions();

  const isAdom = counterparty.name === "Adom Ventures";
  const isOneOff = counterparty.name === "Nana Yeboah";

  function askAssistant() {
    startChat();
    router.push("/nearly-ready/chat");
  }

  return (
    <div className="py-4 border-b border-border">
      <div className="flex items-center gap-3.5">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">{counterparty.name}</div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs opacity-60 cursor-pointer inline-flex items-center gap-1 bg-transparent border-none"
          >
            {counterparty.txns}
            <ChevronDownIcon />
          </button>
        </div>
        <Badge tone={counterparty.classified ? "positive" : "negative"}>{counterparty.role}</Badge>
        <div className="w-[90px] shrink-0 text-right text-[13.5px] font-semibold">{counterparty.value}</div>
      </div>

      {counterparty.needsAction && (isAdom || isOneOff) && (
        <div className="flex gap-2 mt-2.5 flex-wrap">
          {isAdom && (
            <>
              <PillButton variant="success" onClick={() => classifyAdom("Supplier")}>
                Mark as supplier
              </PillButton>
              <PillButton variant="secondary" onClick={() => classifyAdom("Customer")}>
                Mark as customer
              </PillButton>
            </>
          )}
          {isOneOff && (
            <>
              <PillButton variant="success" onClick={() => classifyOneOff("Contract payment")}>
                Contract payment
              </PillButton>
              <PillButton variant="secondary" onClick={() => classifyOneOff("Personal loan")}>
                Personal loan
              </PillButton>
            </>
          )}
          <PillButton variant="secondary" onClick={askAssistant}>
            Ask assistant
          </PillButton>
        </div>
      )}

      {counterparty.classified && (isAdom || isOneOff) && (
        <button
          type="button"
          onClick={isAdom ? undoAdom : undoOneOff}
          className="text-xs inline-block mt-2 opacity-60 bg-transparent border-none cursor-pointer underline"
        >
          Undo classification
        </button>
      )}

      {expanded && counterparty.demoTxns.length > 0 && (
        <div className="mt-3 bg-panel rounded-2xl px-4 py-3.5">
          {counterparty.demoTxns.map((t, i) => (
            <div
              key={i}
              className="flex justify-between text-[12.5px] py-1.5 border-b border-ink/8 last:border-none"
            >
              <span className="opacity-60">{t.date}</span>
              <span>{t.desc}</span>
              <span className="font-semibold">{t.amount}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
