"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SheetPicker, type PickedSpreadsheet } from "@/components/integrations/SheetPicker";
import { useMe } from "@/lib/hooks/use-business";
import { sheetApi } from "@/lib/sheet-sync";

type Tab = { title: string; sheetId: number };

export default function ConnectSheetPage() {
	const router = useRouter();
	const { businessId } = useMe();
	const [file, setFile] = useState<PickedSpreadsheet | null>(null);
	const [tabs, setTabs] = useState<Tab[] | null>(null);
	const [tab, setTab] = useState<Tab | null>(null);
	const [error, setError] = useState("");
	const [saving, setSaving] = useState(false);
	const onError = useCallback((message: string) => setError(message), []);

	async function pick(picked: PickedSpreadsheet) {
		setFile(picked);
		setTabs(null);
		setTab(null);
		setError("");
		const response = await fetch(`/api/integrations/google-sheets/sheets?spreadsheetId=${encodeURIComponent(picked.id)}`);
		const data = (await response.json().catch(() => ({}))) as { sheets?: Tab[]; error?: string };
		if (!response.ok) return setError(data.error ?? "Could not load the tabs in that spreadsheet.");
		setTabs(data.sheets ?? []);
		if (data.sheets?.length === 1) setTab(data.sheets[0]);
	}

	async function connect() {
		if (!businessId || !file || !tab) return;
		setSaving(true);
		setError("");
		try {
			const connection = await sheetApi.create(businessId, {
				spreadsheet_id: file.id, spreadsheet_name: file.name, sheet_gid: tab.sheetId, sheet_title: tab.title,
			});
			router.push(`/apps/sheets/${connection.id}`);
		} catch (problem) {
			setError(problem instanceof Error ? problem.message : "Could not connect that sheet.");
			setSaving(false);
		}
	}

	return (
		<div className="flex-1 min-w-0 px-4 sm:px-7 pt-6 sm:pt-7.5 pb-10 max-w-[820px]">
			<Link href="/apps" className="text-[12.5px] opacity-65 underline underline-offset-2">Integrations</Link>
			<h1 className="text-[24px] sm:text-[28px] m-0 mt-2 mb-1.5">Keep a sheet in sync</h1>
			<p className="text-sm opacity-70 m-0 mb-6">
				Pick the spreadsheet and tab where you keep your sales and costs. OnRecord reads it every 15 minutes and adds new rows
				to Records. It never changes your sheet.
			</p>

			<ol className="m-0 flex list-none flex-col gap-5 p-0">
				<li className="flex flex-col gap-2">
					<span className="text-[13.5px] font-semibold">1. Choose the spreadsheet</span>
					<SheetPicker onPick={(picked) => void pick(picked)} onError={onError} />
					{file ? <span className="text-[12.5px] opacity-70">Chosen: {file.name}</span> : null}
				</li>
				{file ? (
					<li className="flex flex-col gap-2">
						<span className="text-[13.5px] font-semibold">2. Choose the tab with your records</span>
						{tabs === null ? (
							<span className="text-[12.5px] opacity-60">Loading tabs...</span>
						) : (
							<div className="flex flex-wrap gap-2">
								{tabs.map((item) => (
									<button
										key={item.sheetId}
										type="button"
										onClick={() => setTab(item)}
										className={`rounded-full border px-3.5 py-1.5 text-[13px] ${tab?.sheetId === item.sheetId ? "border-foreground bg-foreground text-background" : "border-foreground/20"}`}
									>
										{item.title}
									</button>
								))}
							</div>
						)}
					</li>
				) : null}
			</ol>

			{error ? (
				<p className="mt-5 text-[12.5px] text-destructive">
					{error} <Link href="/apps" className="underline underline-offset-2">Check the Google connection</Link>
				</p>
			) : null}
			<button
				type="button"
				disabled={!tab || saving || !businessId}
				onClick={() => void connect()}
				className="mt-6 rounded-full bg-foreground px-5 py-2.5 text-[13.5px] text-background disabled:cursor-not-allowed disabled:opacity-40"
			>
				{saving ? "Reading your sheet..." : "Next: check the columns"}
			</button>
		</div>
	);
}
