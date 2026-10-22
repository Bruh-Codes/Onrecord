"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { InfoHint } from "@/components/overview/InfoHint";
import { GapRowSkeleton } from "@/components/ui/Skeleton";
import { useChecklist, useGaps, useMe, useScore } from "@/lib/hooks/use-business";
import { askOna } from "@/lib/ona";
import { BAND_LABELS, BAND_MEANING, buildNextSteps, type NextStep } from "@/lib/readiness";

const PILLARS = [
	{
		key: "coverage",
		label: "History",
		weight: 30,
		description:
			"How many recent months your statements cover without breaks. Lenders usually want 6 to 12 months.",
	},
	{
		key: "legibility",
		label: "Clarity",
		weight: 25,
		description:
			"Whether your records are clear enough to work out sales, costs and cash flow.",
	},
	{
		key: "documentation",
		label: "Documents",
		weight: 30,
		description:
			"Whether the documents lenders ask for (registration, TIN, statements) have been added.",
	},
	{
		key: "verifiability",
		label: "Proof",
		weight: 15,
		description:
			"How much of your activity is backed by a bank or MoMo statement rather than typed in.",
	},
] as const;

const SEVERITY_TONE = { blocker: "negative", major: "warning", minor: "neutral" } as const;
const SEVERITY_LABEL = { blocker: "Must have", major: "Important", minor: "Nice to have" } as const;

export default function ReadinessPage() {
	const { businessId } = useMe();
	const score = useScore(businessId);
	const checklist = useChecklist(businessId);
	const gaps = useGaps(businessId);
	const loading = businessId == null || checklist.isLoading || gaps.isLoading;
	const steps = buildNextSteps(gaps.data, checklist.data);
	const done = (gaps.data ?? []).filter((gap) => gap.status !== "open");
	const band = score.data?.band ?? "not_ready";

	return (
		<div className="flex-1 min-w-0 px-4 sm:px-7 pt-6 sm:pt-7.5 pb-10 max-w-[1000px]">
			<div className="mb-6 flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="text-[24px] sm:text-[28px] m-0 mb-1.5">Loan readiness</h1>
					<p className="text-sm opacity-70 m-0 max-w-[620px]">
						How complete your record is for a bank or microfinance lender, and
						what to do next. This is not a lending decision.
					</p>
				</div>
				<Link
					href="/lender-summary"
					className="rounded-full bg-foreground px-4 py-2 text-[13px] text-background no-underline"
				>
					Open lender summary
				</Link>
			</div>

			<div className="grid gap-4 mb-8 md:grid-cols-[1fr_1.6fr]">
				<div className="rounded-2xl border border-border bg-card p-5">
					<div className="text-[12.5px] text-foreground/60">Readiness score</div>
					<div className="mt-1 flex items-baseline gap-2">
						<span className="font-display text-[42px] leading-none tabular-nums">
							{score.data ? Math.round(score.data.total) : "—"}
						</span>
						<span className="text-[15px] text-foreground/50">/ 100</span>
					</div>
					{score.data && (
						<div className="mt-3">
							<Badge tone={band === "lender_ready" ? "positive" : "neutral"}>
								{BAND_LABELS[band]}
							</Badge>
						</div>
					)}
					<p className="m-0 mt-3 text-[13px] leading-relaxed text-foreground/70">
						{score.data
							? BAND_MEANING[band]
							: "Your score appears after your first statement is processed."}
					</p>
				</div>
				<div className="rounded-2xl border border-border bg-card p-5">
					<div className="text-[13px] font-semibold mb-4">What the score is made of</div>
					<div className="grid gap-4 sm:grid-cols-2">
						{PILLARS.map((pillar) => {
							const value = score.data?.pillars[pillar.key];
							const pct = value ? Math.min(100, (value.earned / pillar.weight) * 100) : 0;
							return (
								<div key={pillar.key}>
									<div className="flex justify-between text-[13px]">
										<div className="flex items-center gap-1.5 font-semibold">
											<span>{pillar.label}</span>
											<InfoHint text={pillar.description} />
										</div>
										<span className="tabular-nums text-foreground/60">
											{value ? Math.round(value.earned) : "—"} / {pillar.weight}
										</span>
									</div>
									<div className="h-1.5 rounded-full bg-border/60 mt-2 overflow-hidden">
										<div className="h-full rounded-full bg-foreground" style={{ width: `${pct}%` }} />
									</div>
								</div>
							);
						})}
					</div>
				</div>
			</div>

			<h2 className="m-0 mb-1 text-[17px] font-semibold font-[family-name:var(--body-font)]">
				Do these next
			</h2>
			<p className="m-0 mb-3 text-[13px] text-foreground/60">
				Most important first. Ona can explain any item or help you find the document.
			</p>
			{loading ? (
				<div aria-busy="true" aria-label="Loading next steps">
					<GapRowSkeleton />
					<GapRowSkeleton />
					<GapRowSkeleton />
				</div>
			) : steps.length === 0 ? (
				<div className="rounded-2xl bg-muted p-6 text-[13.5px] text-foreground/70">
					Nothing open. Your record has everything this lender checklist asks for.
				</div>
			) : (
				<ol className="m-0 list-none p-0 flex flex-col gap-2.5">
					{steps.map((step, index) => (
						<StepRow key={step.id} step={step} index={index + 1} />
					))}
				</ol>
			)}

			{done.length > 0 && (
				<details className="mt-6">
					<summary className="cursor-pointer text-[13px] font-semibold text-foreground/70">
						Done ({done.length})
					</summary>
					<ul className="m-0 mt-2 list-none p-0">
						{done.map((gap) => (
							<li key={gap.id} className="flex items-center gap-2.5 py-2 border-b border-foreground/6 text-[13px] text-foreground/60">
								<span className="w-2 h-2 rounded-full bg-positive shrink-0" />
								{gap.title}
							</li>
						))}
					</ul>
				</details>
			)}
		</div>
	);
}

function StepRow({ step, index }: { step: NextStep; index: number }) {
	return (
		<li className="rounded-2xl border border-border bg-card p-4">
			<div className="flex items-start gap-3">
				<span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-foreground/25 text-[12px] tabular-nums">
					{index}
				</span>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-start justify-between gap-2">
						<div className="text-[14px] font-semibold">{step.title}</div>
						<Badge tone={SEVERITY_TONE[step.severity]}>{SEVERITY_LABEL[step.severity]}</Badge>
					</div>
					{step.detail && <div className="mt-1 text-[12.5px] text-foreground/65">{step.detail}</div>}
					<div className="mt-3 flex flex-wrap gap-2">
						{step.action === "upload" && (
							<Link href="/documents" className="rounded-full bg-foreground px-3.5 py-1.5 text-[12.5px] text-background no-underline">
								Upload
							</Link>
						)}
						{step.action === "categorise" && (
							<Link href="/reviewer" className="rounded-full bg-foreground px-3.5 py-1.5 text-[12.5px] text-background no-underline">
								Sort transactions
							</Link>
						)}
						<button
							type="button"
							onClick={() => askOna(step.prompt)}
							className="cursor-pointer rounded-full border border-foreground/16 bg-transparent px-3.5 py-1.5 text-[12.5px] text-foreground"
						>
							Ask Ona
						</button>
					</div>
				</div>
			</div>
		</li>
	);
}
