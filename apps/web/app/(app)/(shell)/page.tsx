"use client";

import Link from "next/link";
import { GetStartedCard } from "@/components/home/GetStartedCard";
import { TodayStats } from "@/components/home/TodayStats";
import { useAppState } from "@/lib/app-state";
import { authClient } from "@/lib/auth-client";
import { useMe, useScore, useCoverage, useGaps } from "@/lib/hooks/use-business";

export default function HomePage() {
  const state = useAppState();
  const { data: session } = authClient.useSession();
  const ownerFirstName = session?.user?.name?.split(" ")[0];
  const { data: me, businessId } = useMe();
  const score = useScore(businessId);
  const coverage = useCoverage(businessId);
  const gaps = useGaps(businessId);
  const tradingName = me?.business?.trading_name || me?.business?.legal_name;

  return (
    <div className="px-7 pt-7.5 pb-10">
      {state.draftMode && (
        <div className="bg-panel-strong text-[#2a2a2a] text-[12.5px] px-4 py-2.5 rounded-xl mb-4.5">
          Draft mode is on — this profile is not visible to reviewers yet. Turn it off when you&apos;re ready to
          share.
        </div>
      )}
      <h1 className="text-[30px] m-0 mb-1.5">Welcome back{ownerFirstName ? `, ${ownerFirstName}` : ""}!</h1>
      <p className="text-[14.5px] opacity-80 m-0 mb-6.5">
        Browse your <Link href="/overview">readiness overview</Link>, see{" "}
        <Link href="/nearly-ready">what&apos;s still missing</Link>, or go to{" "}
        <Link href="/documents">Documents</Link> to upload a file or{" "}
        <Link href="/documents">enter figures manually</Link>.
      </p>

      <GetStartedCard />

      <h2 className="text-[22px] m-0 mb-4">Today</h2>
      <div className="h-px bg-border mb-7" />

      <TodayStats
        coverage={coverage.data}
        score={score.data}
        openGaps={(gaps.data ?? []).filter((g) => g.status === "open")}
      />

      <p className="text-[11px] opacity-40 mt-10">{tradingName ?? "Your business"}</p>
    </div>
  );
}