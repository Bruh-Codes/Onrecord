"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { InfoHint } from "@/components/overview/InfoHint";
import { useChecklist, useMe, useScore } from "@/lib/hooks/use-business";

const PILLARS = [
	{
		key: "coverage",
		label: "Coverage",
		weight: 30,
		description:
			"How much transaction history and account coverage we have, including continuity and unclassified value.",
	},
	{
		key: "legibility",
		label: "Legibility",
		weight: 25,
		description:
			"Whether the available records are clear enough to calculate the core business indicators.",
	},
	{
		key: "documentation",
		label: "Documentation",
		weight: 30,
		description:
			"Whether the documents needed to support a lender-ready application have been uploaded and extracted.",
	},
	{
		key: "verifiability",
		label: "Verifiability",
		weight: 15,
		description:
			"How much of the recorded activity is backed by a statement or other source document.",
	},
] as const;

const BAND_LABELS: Record<string, string> = {
	not_ready: "Not ready",
	developing: "Developing",
	nearly_ready: "Nearly ready",
	lender_ready: "Lender ready",
};

export default function ReadinessPage() {
	const { businessId } = useMe();
	const score = useScore(businessId);
	const checklist = useChecklist(businessId);
	const openChecklist = (checklist.data ?? []).filter(
		(item) => item.status === "missing",
	);

	return (
		<div className="flex-1 min-w-0 px-4 sm:px-7 pt-6 sm:pt-7.5 pb-10">
			<h1 className="text-[24px] sm:text-[28px] m-0 mb-1.5">
				How readiness is calculated
			</h1>
			<p className="text-sm opacity-70 m-0 mb-8 max-w-[680px]">
				Your readiness score measures the completeness, consistency, and
				evidence behind your file. It is not a lending decision.
			</p>

			<div className="grid gap-5 md:grid-cols-[2fr_2fr] mb-10 lg:grid-cols-[1fr_2fr]">
				<div className="rounded-xl border border-border/70 p-5 bg-muted">
					<div className="text-xs uppercase tracking-wider text-foreground/50">
						Current readiness
					</div>
					<div className="font-display text-[42px] mt-2">
						{score.data ? score.data.total.toFixed(2) : "—"}
					</div>
					{score.data && (
						<Badge
							tone={score.data.band === "lender_ready" ? "positive" : "neutral"}
						>
							{BAND_LABELS[score.data.band]}
						</Badge>
					)}
					<p className="text-xs opacity-60 mt-4">
						Scores are out of 100 and update after recompute.
					</p>
				</div>
				<div className="rounded-xl border border-border/70 p-5 bg-muted">
					<div className="text-sm font-semibold mb-4">Score pillars</div>
					<div className="flex flex-wrap gap-4">
						{PILLARS.map((pillar) => {
							const value = score.data?.pillars[pillar.key];
							return (
								<div key={pillar.key} className="flex-1 min-w-[200px]">
									<div className="flex justify-between text-[13px] font-semibold">
										<div className="flex items-center gap-1.5">
											<span>{pillar.label}</span>
											<InfoHint text={pillar.description} />
										</div>
										<span>
											{value
												? `${value.earned.toFixed(1)} / ${pillar.weight}`
												: `— / ${pillar.weight}`}
										</span>
									</div>
									<div className="h-1.5 rounded-full bg-border/60 mt-2 overflow-hidden">
										<div
											className="h-full rounded-full bg-foreground"
											style={{
												width: `${value ? (value.earned / pillar.weight) * 100 : 0}%`,
											}}
										/>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			</div>

			<div className="rounded-xl border border-border/70 p-5">
				<div className="flex items-center justify-between gap-3 mb-1">
					<div className="text-sm font-semibold">Open evidence items</div>
					<Link
						href="/gaps"
						className="text-[13px] underline underline-offset-4"
					>
						View gaps
					</Link>
				</div>
				<p className="text-xs opacity-60 mb-4">
					These are lender-readiness requirements, not errors in your business
					insights.
				</p>
				{businessId == null || checklist.isLoading ? (
					<div className="text-[13px] opacity-60">Loading checklist…</div>
				) : openChecklist.length === 0 ? (
					<div className="text-[13px] opacity-60">
						No missing checklist items.
					</div>
				) : (
					<div className="grid gap-2 sm:grid-cols-2">
						{openChecklist.map((item) => (
							<div
								key={item.id}
								className="rounded-lg bg-border/25 px-3 py-2.5 text-[13px]"
							>
								{item.doc_type.replaceAll("_", " ")}
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
