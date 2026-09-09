import { Sparkline } from "@/components/ui/Sparkline";
import type { Coverage, Gap, ReadinessScore } from "@/lib/api-types";

export function TodayStats({
	coverage,
	score,
	openGaps,
	isNewUser = false,
}: {
	coverage: Coverage | undefined;
	score: ReadinessScore | undefined;
	openGaps: Gap[];
	isNewUser?: boolean;
}) {
	const continuous = coverage?.continuous_months ?? 0;
	const windowMonths = coverage?.analysis_window_months ?? 12;
	const coveragePositive = coverage ? continuous >= windowMonths : false;
	const coverageColor = coveragePositive
		? "var(--color-positive)"
		: "var(--color-negative)";

	const total = score?.total ?? 0;
	const band = score?.band ?? "not_ready";
	const bandLabel =
		band === "lender_ready"
			? "Lender-ready"
			: band === "nearly_ready"
				? "Nearly ready"
				: band === "developing"
					? "Developing"
					: "Not ready";
	const scoreColor =
		total >= 65
			? "var(--color-positive)"
			: total >= 40
				? "var(--color-muted)"
				: "var(--color-negative)";

	const nextGap =
		openGaps.find((g) => g.kind === "missing_period") ?? openGaps[0];

	return (
		<div className="flex gap-12 flex-wrap pt-12">
			<div className="flex-1 min-w-[260px]">
				<div className="text-[13px] opacity-65 mb-2.5">Statement coverage</div>
				<div
					className="font-[family-name:var(--font-display)] text-[30px] mb-0.5"
					style={{ color: coverageColor }}
				>
					{isNewUser
						? "Not calculated"
						: coverage
							? `${continuous} / ${windowMonths} months`
							: "—"}
				</div>
				<div className="text-xs opacity-55 mb-3.5">
					{isNewUser
						? "Upload a statement to measure your history"
						: coverage
							? coveragePositive
								? "Fully covered"
								: `${windowMonths - continuous} month(s) still missing`
							: "No coverage computed yet"}
				</div>
				<Sparkline
					points="0,44 220,44"
					color={isNewUser ? "var(--color-border)" : coverageColor}
				/>
			</div>
			<div className="flex-1 min-w-[260px]">
				<div className="text-[13px] opacity-65 mb-2.5">Readiness score</div>
				<div
					className="font-[family-name:var(--font-display)] text-[30px] mb-0.5"
					style={{ color: scoreColor }}
				>
					{isNewUser ? "Not calculated" : score ? `${total}` : "—"}{" "}
					{!isNewUser && <span className="text-[15px] opacity-50">/ 100</span>}
				</div>
				<div className="text-xs opacity-55 mb-3.5">
					{isNewUser
						? "Calculated after your first source is processed"
						: `${bandLabel} · not a credit decision`}
				</div>
				<Sparkline
					points="0,30 220,30"
					color={isNewUser ? "var(--color-border)" : scoreColor}
				/>
			</div>
			<div className="w-[220px] shrink-0">
				<div className="text-[13px] opacity-65 mb-2.5">Next request</div>
				{nextGap ? (
					<>
						<div className="text-[16px] font-semibold mb-0.5 leading-snug">
							{nextGap.title}
						</div>
						<div className="text-xs opacity-55">
							{nextGap.detail ?? nextGap.code}
						</div>
					</>
				) : (
					<>
						<div className="text-[18px] font-semibold mb-0.5">
							{isNewUser ? "Nothing requested yet" : "Nothing open"}
						</div>
						<div className="text-xs opacity-55">
							{isNewUser
								? "Your first upload will create the next steps"
								: "No open requests right now"}
						</div>
					</>
				)}
			</div>
		</div>
	);
}
