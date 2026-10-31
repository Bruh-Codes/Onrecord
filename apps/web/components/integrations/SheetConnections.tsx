"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useMe } from "@/lib/hooks/use-business";
import { STATUS_TEXT, timeAgo, useSheetConnections } from "@/lib/sheet-sync";

/** The sheets OnRecord keeps reading, under the Google Sheets card. */
export function SheetConnections() {
	const { businessId } = useMe();
	const connections = useSheetConnections(businessId);

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
			<div className="flex flex-wrap items-center gap-3">
				<Link href="/apps/sheets/new" className="rounded-full bg-foreground px-4 py-2 text-[13px] text-background">
					{items.length ? "Connect another sheet" : "Keep a sheet in sync"}
				</Link>
				<span className="text-[12px] opacity-60">
					OnRecord checks connected sheets every 15 minutes and adds new rows to Records for you.
				</span>
			</div>
		</div>
	);
}
