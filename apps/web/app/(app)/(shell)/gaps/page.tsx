"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { PillButton } from "@/components/ui/PillButton";
import { useAppActions } from "@/lib/app-state";
import { useGaps, useMe } from "@/lib/hooks/use-business";

export default function GapsPage() {
  const { businessId } = useMe();
  const { data: gaps, isLoading } = useGaps(businessId);
  const { startChat } = useAppActions();
  const router = useRouter();
  const openGaps = (gaps ?? []).filter((g) => g.status === "open");
  const resolvedGaps = (gaps ?? []).filter((g) => g.status !== "open");

  function askAssistant() {
    startChat();
    router.push("/nearly-ready/chat");
  }

  return (
    <div className="flex-1 min-w-0 px-4 sm:px-7 pt-6 sm:pt-7.5 pb-10 max-w-[760px]">
      <h1 className="text-[24px] sm:text-[28px] m-0 mb-1.5">Gaps</h1>
      <p className="text-sm opacity-70 m-0 mb-6">
        {isLoading ? "Loading…" : `${openGaps.length} open — resolve them here, in Documents, in Counterparties, or by talking to the assistant.`}
      </p>

      {openGaps.map((gap) => (
        <div key={gap.id} className="py-4 border-b border-border">
          <div className="flex justify-between items-start gap-2.5 mb-1">
            <div className="text-sm font-semibold">{gap.title}</div>
            <Badge tone="negative">{gap.severity}</Badge>
          </div>
          <div className="text-[12.5px] opacity-65 mb-2.5">{gap.detail ?? gap.code}</div>
          <div className="flex gap-2">
            {["missing_period", "coverage_gap", "data_quality"].includes(gap.kind) && (
              <PillButton onClick={askAssistant}>Ask assistant</PillButton>
            )}
            <Link
              href="/documents"
              className="rounded-full text-[13px] px-4 py-2 bg-transparent border border-ink/16 text-ink"
            >
              Go to documents
            </Link>
          </div>
        </div>
      ))}
      {!isLoading && openGaps.length === 0 && (
        <div className="text-sm py-4 opacity-70">No open gaps — everything looks captured.</div>
      )}

      {resolvedGaps.length > 0 && (
        <>
          <div className="text-[13px] font-semibold mt-6.5 mb-2.5 opacity-70">Resolved</div>
          {resolvedGaps.map((gap) => (
            <div key={gap.id} className="flex items-center gap-2.5 py-2.5 border-b border-ink/6">
              <span className="w-2 h-2 rounded-full bg-positive shrink-0" />
              <div className="text-[13px] opacity-60">{gap.title}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}