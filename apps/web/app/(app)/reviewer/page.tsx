"use client";

import { useState } from "react";
import Link from "next/link";
import { BackArrowIcon } from "@/components/icons";
import { ReviewDetailPanel } from "@/components/reviewer/ReviewDetailPanel";
import { ReviewTable } from "@/components/reviewer/ReviewTable";
import { useAppActions, useAppState } from "@/lib/app-state";
import { getReviewItems } from "@/lib/derived";

export default function ReviewerQueuePage() {
  const state = useAppState();
  const { setReviewStatus } = useAppActions();
  const items = getReviewItems(state);
  const [selectedId, setSelectedId] = useState(items[0].id);

  const selectedItem = items.find((i) => i.id === selectedId) ?? items[0];
  const openCount = items.filter((i) => i.status === "Open").length;

  return (
    <div className="px-10 py-8 pb-16 max-w-[1200px] mx-auto animate-fade-in">
      <Link href="/" className="text-[13px] inline-flex items-center gap-1 mb-3.5">
        <BackArrowIcon />
        Back to owner view
      </Link>
      <div className="mb-1.5 text-[11px] tracking-wider uppercase text-ink/55">Review queue</div>
      <h1 className="text-[30px] m-0 mb-1.5">Low-confidence extractions</h1>
      <p className="text-sm opacity-75 m-0 mb-6.5">{openCount} items need a human look before they enter a ledger.</p>

      <div className="grid gap-6 items-start" style={{ gridTemplateColumns: "1.3fr 1fr" }}>
        <ReviewTable items={items} selectedId={selectedId} onSelect={setSelectedId} />
        <ReviewDetailPanel
          item={selectedItem}
          onApprove={() => setReviewStatus(selectedItem.id, "Approved")}
          onFlag={() => setReviewStatus(selectedItem.id, "Flagged")}
        />
      </div>
    </div>
  );
}
