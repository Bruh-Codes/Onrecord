"use client";

import { formatGhs } from "@/lib/format";
import type { FarmFilter, MoneySummary } from "@/lib/money";

/** Money in, money out and what was left for each crop or animal and season. */
export function FarmBreakdown({
	farm,
	filter,
	onFilter,
}: {
	farm: MoneySummary["farm"];
	filter: FarmFilter;
	onFilter: (filter: FarmFilter) => void;
}) {
	if (!farm.groups.length) {
		return (
			<div className="mt-4 rounded-2xl border border-dashed border-foreground/25 px-4 py-3 text-[13px] text-foreground/70">
				Farming? Give your records a crop or animal and a season (for example Tomatoes, 2026 main season) to see how each one did.
			</div>
		);
	}
	return (
		<section className="mt-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
			<h2 className="m-0 text-[15px] font-semibold font-[family-name:var(--body-font)]">By crop and season</h2>
			<p className="m-0 mt-1 mb-3 text-[12px] text-foreground/50">
				Left over is money in minus money out. It isn&apos;t profit: unpaid bills, stock still on hand and untagged costs are not in it. Tap a row to see only its records.
			</p>
			<div className="overflow-x-auto">
				<table className="w-full min-w-[520px] border-collapse text-[13px]">
					<thead>
						<tr className="text-left text-[11.5px] text-foreground/55">
							<th className="py-2 pr-3 font-medium">Crop or animal · season</th>
							<th className="py-2 px-3 text-right font-medium">Money in</th>
							<th className="py-2 px-3 text-right font-medium">Money out</th>
							<th className="py-2 pl-3 text-right font-medium">Left over</th>
						</tr>
					</thead>
					<tbody>
						{farm.groups.map((group) => {
							const active = filter.farm_activity === (group.farm_activity ?? "untagged") && filter.season === (group.season ?? "untagged");
							return (
								<tr
									key={`${group.farm_activity}|${group.season}`}
									onClick={() => onFilter(active ? {} : { farm_activity: group.farm_activity ?? "untagged", season: group.season ?? "untagged" })}
									className={`cursor-pointer border-t border-border hover:bg-muted/60 ${active ? "bg-muted" : ""}`}
								>
									<td className="py-2.5 pr-3">
										<div className="font-semibold">{group.farm_activity ?? "No crop given"}</div>
										<div className="text-[12px] text-foreground/55">
											{[group.season ?? "No season given", `${group.transactions} records`, group.typed_in_by_owner ? `${group.typed_in_by_owner} typed in by you` : null].filter(Boolean).join(" · ")}
										</div>
									</td>
									<td className="py-2.5 px-3 text-right tabular-nums text-positive">{formatGhs(group.money_in_pesewas)}</td>
									<td className="py-2.5 px-3 text-right tabular-nums">{formatGhs(group.money_out_pesewas)}</td>
									<td className={`py-2.5 pl-3 text-right font-semibold tabular-nums ${group.left_over_pesewas < 0 ? "text-destructive" : ""}`}>
										{formatGhs(group.left_over_pesewas)}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			{farm.untagged.transactions > 0 && (
				<p className="m-0 mt-3 text-[12.5px] text-foreground/60">
					{farm.untagged.transactions === 1 ? "1 record has" : `${farm.untagged.transactions} records have`} no crop or season. Use “Tag” in the list below to add one.
				</p>
			)}
		</section>
	);
}
