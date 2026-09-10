"use client";

import Link from "next/link";
import { GetStartedCard } from "@/components/home/GetStartedCard";
import { TodayStats } from "@/components/home/TodayStats";
import { useAppState } from "@/lib/app-state";
import { authClient } from "@/lib/auth-client";
import {
	useMe,
	useScore,
	useCoverage,
	useGaps,
	useDocuments,
} from "@/lib/hooks/use-business";

export default function HomePage() {
	const state = useAppState();
	const { data: session } = authClient.useSession();
	const ownerFirstName = session?.user?.name?.split(" ")[0];
	const { businessId } = useMe();
	const score = useScore(businessId);
	const coverage = useCoverage(businessId);
	const gaps = useGaps(businessId);
	const documents = useDocuments(businessId);
	// Until the first document exists, keep the home state safe for a fresh account.
	// This also avoids showing seeded actions if the documents request is unavailable.
	const isNewUser = !documents.data || documents.data.total === 0;

	return (
		<div className="px-4 sm:px-7 pt-6 sm:pt-7.5 pb-10">
			{state.draftMode && (
				<div className="bg-panel-strong text-[#2a2a2a] text-[12.5px] px-4 py-2.5 rounded-xl mb-4.5">
					Draft mode is on-this profile is not visible to reviewers yet. Turn it
					off when you&apos;re ready to share.
				</div>
			)}
			<h1 className="text-[24px] sm:text-[30px] m-0 mb-1.5">
				Welcome back{ownerFirstName ? `, ${ownerFirstName}` : ""}!
			</h1>
			<p className="text-[14.5px] text-muted m-0 mb-6.5">
				Review your <Link href="/overview" className="font-semibold text-white">readiness overview</Link>, close the{" "}
				<Link href="/nearly-ready" className="font-semibold text-white">open gaps</Link>, or add documents:{" "}
				<Link href="/documents" className="font-semibold text-white">upload a file</Link> or{" "}
				<Link href="/documents" className="font-semibold text-white">enter figures manually</Link>.
			</p>

			<GetStartedCard hasData={!isNewUser} />

			<TodayStats
				coverage={coverage.data}
				score={score.data}
				openGaps={(gaps.data ?? []).filter((g) => g.status === "open")}
				isNewUser={isNewUser}
			/>
		</div>
	);
}
