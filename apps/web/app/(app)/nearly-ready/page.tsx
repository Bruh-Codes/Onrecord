"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDownIcon } from "@/components/icons";
import { CollapsedStep } from "@/components/nearlyready/CollapsedStep";
import { ReadinessTimeline } from "@/components/nearlyready/ReadinessTimeline";
import { useAppActions, useAppState } from "@/lib/app-state";
import { useChecklist, useGaps, useMe, useScore } from "@/lib/hooks/use-business";

export default function NearlyReadyPage() {
  const state = useAppState();
  const { startChat } = useAppActions();
  const router = useRouter();
  const { data: me, businessId } = useMe();
  const { data: checklist } = useChecklist(businessId);
  const { data: gaps } = useGaps(businessId);
  const { data: score } = useScore(businessId);

  const businessName = me?.business?.trading_name || me?.business?.legal_name;
  const openGaps = (gaps ?? []).filter((g) => g.status === "open");
  const unresolvedDocs = (checklist ?? []).filter((c) => c.status === "missing" || c.status === "unavailable");
  const documentsDone = unresolvedDocs.length === 0 && (checklist ?? []).length > 0;
  const profileReady = score?.band === "lender_ready";
  const chatDone = state.chatLog.length > 0;
  const chatInProgress = chatDone && state.chatIndex < 3;

  function openAssistantChat() {
    startChat();
    router.push("/nearly-ready/chat");
  }

  const steps = [
    { n: 2, title: "Upload remaining documents", done: documentsDone },
    { n: 3, title: "Service your accountant's data request", done: false },
  ];

  return (
    <div className="min-h-screen">
      <div className="flex items-center px-4 sm:px-10 py-4 sm:py-5">
        <Link href="/dashboard" className="font-display text-lg">
          Onrecord
        </Link>
        <div className="ml-auto flex items-center gap-2 text-[13.5px]">
          <span className="w-[26px] h-[26px] rounded-full bg-[#dddddb] inline-block" />
          <span className="hidden sm:inline">{businessName ?? "Your business"}</span>
          <ChevronDownIcon />
        </div>
      </div>

      <div className="max-w-[1040px] mx-auto px-4 sm:px-10 pb-15 pt-5">
        <div className="text-[11px] tracking-wider uppercase text-foreground/50 mb-1.5">
          {businessName ?? "Your business"}
        </div>
        <h1 className="text-[24px] sm:text-[32px] m-0 mb-2">Almost lender-ready</h1>
        <p className="text-[14.5px] opacity-75 m-0 mb-8">
          To move into the next readiness band, complete the steps below:
        </p>

        <div className="grid gap-10 grid-cols-1 lg:grid-cols-[1fr_300px]">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="w-[26px] h-[26px] rounded-full bg-foreground text-background flex items-center justify-center text-[13px] font-bold shrink-0">
                1
              </span>
              <div className="text-[17px] font-semibold">
                Talk to your assistant about {openGaps.length} open item{openGaps.length === 1 ? "" : "s"}
              </div>
            </div>

            <div className="border border-border rounded-[20px] overflow-hidden mb-5.5">
              <div className="p-6">
                <div className="flex items-center gap-2 text-[16.5px] font-semibold mb-3.5">
                  Answer questions that unlock points
                  <span className="w-[15px] h-[15px] rounded-full border-[1.4px] border-foreground/40 flex items-center justify-center text-[10px]">
                    ?
                  </span>
                </div>
                <div className="flex items-center gap-2.5 text-[13.5px] mb-2">
                  <span className="text-foreground">✓</span>Classifying a counterparty clears many transactions at
                  once
                </div>
                <div className="flex items-center gap-2.5 text-[13.5px] mb-4.5">
                  <span className="text-foreground">✓</span>Unlocks the documentation and legibility pillars
                </div>
                <button
                  type="button"
                  onClick={openAssistantChat}
                  className="bg-foreground text-background font-display text-sm px-6.5 py-3 border-none rounded-full cursor-pointer"
                >
                  Open assistant chat
                </button>
              </div>
              <div className="bg-muted px-6 py-4 text-[12.5px] opacity-75 leading-relaxed">
                Missing a document instead? <Link href="/documents">Skip this step</Link> and upload it
                whenever you have it.
              </div>
            </div>

            {steps.map((step) => (
              <CollapsedStep key={step.n} n={step.n} title={step.title} done={step.done} />
            ))}
          </div>

          <ReadinessTimeline
            documentsDone={documentsDone}
            chatDone={chatDone}
            chatInProgress={chatInProgress}
            profileReady={profileReady}
            documentsDetail={
              documentsDone
                ? "All required documents captured"
                : `${unresolvedDocs.length} document(s) still needed`
            }
          />
        </div>
      </div>
    </div>
  );
}
