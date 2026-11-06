"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { SheetColumnSetup } from "@/components/integrations/SheetColumnSetup";
import { SheetRowList } from "@/components/integrations/SheetRowList";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { STATUS_TEXT, sheetApi, timeAgo, useSheetConnection, useSheetMutation } from "@/lib/sheet-sync";

const BUTTON = "rounded-full border border-foreground/20 px-4 py-2 text-[13px] disabled:opacity-40";

export default function SheetConnectionPage() {
	const { id } = useParams<{ id: string }>();
	const router = useRouter();
	const { toast } = useToast();
	const connection = useSheetConnection(id);
	const [editingColumns, setEditingColumns] = useState(false);
	const syncNow = useSheetMutation(() => sheetApi.sync(id));
	const pause = useSheetMutation(() => sheetApi.pause(id));
	const resume = useSheetMutation(() => sheetApi.resume(id));
	const disconnect = useSheetMutation(() => sheetApi.disconnect(id));

	if (connection.isLoading) return <div className="px-4 sm:px-7 pt-7"><Skeleton className="h-40 max-w-[820px] rounded-2xl" /></div>;
	if (connection.error || !connection.data) {
		return <p className="px-4 sm:px-7 pt-7 text-[13px]">This sheet isn&apos;t connected. <Link href="/apps" className="underline">Back to Integrations</Link></p>;
	}
	const sheet = connection.data;
	const status = STATUS_TEXT[sheet.status];
	const result = sheet.last_result;
	const setup = sheet.status === "needs_mapping" || editingColumns;

	async function run(action: { mutateAsync: () => Promise<unknown> }, done: string) {
		try {
			await action.mutateAsync();
			toast({ title: done, tone: "success" });
		} catch (problem) {
			toast({ title: problem instanceof Error ? problem.message : "That didn't work. Try again.", tone: "error" });
		}
	}

	return (
		<div className="flex-1 min-w-0 px-4 sm:px-7 pt-6 sm:pt-7.5 pb-10 max-w-[860px]">
			<Link href="/apps" className="text-[12.5px] opacity-65 underline underline-offset-2">Integrations</Link>
			<div className="mt-2 mb-1.5 flex flex-wrap items-center gap-3">
				<h1 className="m-0 text-[24px] sm:text-[28px]">{sheet.spreadsheet_name}</h1>
				<Badge tone={status.tone}>{status.label}</Badge>
			</div>
			<p className="m-0 mb-6 text-sm opacity-70">
				{sheet.status === "needs_mapping" ? (
					"Check that OnRecord read it right, then start."
				) : (
					<>
						Tab: {sheet.sheet_title} · checked {timeAgo(sheet.last_checked_at)}
						{sheet.last_synced_at ? ` · last change read ${timeAgo(sheet.last_synced_at)}` : ""}
					</>
				)}
			</p>

			{sheet.last_error ? (
				<div className="mb-5 rounded-xl border border-destructive/40 bg-destructive-background px-4 py-3 text-[13px]">
					{sheet.last_error}
					{sheet.last_error.includes("Reconnect") ? <> <Link href="/apps" className="font-semibold underline">Reconnect Google</Link></> : null}
				</div>
			) : null}

			{setup ? (
				<div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
					<SheetColumnSetup
						connectionId={id}
						sheet={sheet}
						onDone={() => {
							setEditingColumns(false);
							toast({ title: "Columns saved. OnRecord is reading your sheet now.", tone: "success" });
						}}
						onCancel={editingColumns ? () => setEditingColumns(false) : undefined}
					/>
				</div>
			) : (
				<>
					<p className="m-0 mb-5 text-[14px]">
						<span className="font-semibold">{sheet.counts.in_ledger ?? 0} records</span> from this sheet
						{result.added ? `, ${result.added} added last time` : ""}.{" "}
						{sheet.status === "paused" ? "Paused, so new rows wait." : "New rows come in by themselves every 15 minutes."}
					</p>

					<div className="mb-8 flex flex-wrap gap-2">
						{sheet.status === "paused" ? (
							<button type="button" className={BUTTON} disabled={resume.isPending} onClick={() => void run(resume, "Syncing again")}>Resume syncing</button>
						) : (
							<>
								<button type="button" className="rounded-full bg-foreground px-4 py-2 text-[13px] text-background disabled:opacity-40" disabled={syncNow.isPending} onClick={() => void run(syncNow, "Checking your sheet now")}>
									Sync now
								</button>
								<button type="button" className={BUTTON} disabled={pause.isPending} onClick={() => void run(pause, "Paused")}>Pause</button>
							</>
						)}
						<button type="button" className={BUTTON} onClick={() => setEditingColumns(true)}>Change columns</button>
						{sheet.document_id ? <Link href="/money" className={BUTTON}>See records</Link> : null}
						<button
							type="button"
							className={`${BUTTON} text-destructive`}
							disabled={disconnect.isPending}
							onClick={async () => {
								if (!window.confirm("Stop reading this sheet? Records already in OnRecord stay, with their history.")) return;
								await run(disconnect, "Sheet disconnected");
								router.push("/apps");
							}}
						>
							Disconnect
						</button>
					</div>

					{sheet.review_rows.length ? (
						<SheetRowList title="Needs a look" empty="" rows={sheet.review_rows} withActions />
					) : null}
					{sheet.changed_rows.length ? (
						<SheetRowList title="Changes OnRecord noticed" empty="" rows={sheet.changed_rows} />
					) : null}
				</>
			)}
		</div>
	);
}
