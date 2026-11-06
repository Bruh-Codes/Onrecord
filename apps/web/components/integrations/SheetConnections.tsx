"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useMe } from "@/lib/hooks/use-business";
import { SheetQuickConnect } from "@/components/integrations/SheetQuickConnect";
import { STATUS_TEXT, timeAgo, useSheetConnections } from "@/lib/sheet-sync";

/** The sheets OnRecord keeps reading, under the Google Sheets card, plus the
 *  one-step picker for adding one. */
export function SheetConnections() {
	const { businessId } = useMe();
	const connections = useSheetConnections(businessId);
	const [adding, setAdding] = useState(false);

	if (connections.isLoading) return <Skeleton className="h-14 rounded-xl" />;
	const items = connections.data ?? [];

	return (
		<div className="flex flex-col gap-2">
			{items.map((connection) => {
				const status = STATUS_TEXT[connection.status];
				const toReview = connection.counts.to_review ?? 0;
				return (
					<Link
						key={connection.id}
						href={`/apps/sheets/${connection.id}`}
						className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-foreground/12 px-4 py-3 hover:bg-accent/50"
					>
						<div className="min-w-0 flex-1">
							<div className="truncate text-[13.5px] font-semibold">
								{connection.spreadsheet_name} <span className="font-normal opacity-60">· {connection.sheet_title}</span>
							</div>
							<div className="text-[12px] opacity-65">
								{connection.counts.in_ledger ?? 0} records · checked {timeAgo(connection.last_checked_at)}
								{toReview ? ` · ${toReview} to look at` : ""}
							</div>
						</div>
						<Badge tone={toReview && connection.status === "active" ? "warning" : status.tone}>
							{toReview && connection.status === "active" ? "Needs a look" : status.label}
						</Badge>
					</Link>
				);
			})}
			{items.length && !adding ? (
				<button type="button" onClick={() => setAdding(true)} className="self-start text-[13px] font-semibold underline underline-offset-2">
					Add another sheet
				</button>
			) : (
				<div className="flex flex-col gap-1.5">
					{items.length ? null : <span className="text-[13px] font-semibold">Pick the sheet you keep your sales or costs in</span>}
					<SheetQuickConnect />
					<span className="text-[12px] opacity-60">OnRecord checks it every 15 minutes and adds new rows. It never edits your sheet.</span>
				</div>
			)}
		</div>
	);
}
