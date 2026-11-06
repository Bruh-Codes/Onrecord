"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { SheetPicker, type PickedSpreadsheet } from "@/components/integrations/SheetPicker";
import { useMe } from "@/lib/hooks/use-business";
import { sheetApi } from "@/lib/sheet-sync";
import { connectGoogleSheets } from "@/lib/google-sheets-connect";

type Tab = { title: string; sheetId: number };

/**
 * One step: pick a spreadsheet and go straight to checking it. OnRecord opens
 * the first tab; the next page can switch tabs before the first sync.
 */
export function SheetQuickConnect({ returnTo = "/apps" }: { returnTo?: string }) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const { businessId } = useMe();
	const [opening, setOpening] = useState<string | null>(null);
	const [error, setError] = useState("");
	const [needsReconnect, setNeedsReconnect] = useState(false);
	const onError = useCallback((message: string, reconnect = false) => {
		setError(message);
		setNeedsReconnect(reconnect);
	}, []);

	async function pick(file: PickedSpreadsheet) {
		if (!businessId) return;
		setOpening(file.name);
		onError("");
		try {
			const response = await fetch(`/api/integrations/google-sheets/sheets?spreadsheetId=${encodeURIComponent(file.id)}`);
			const data = (await response.json().catch(() => ({}))) as { sheets?: Tab[]; error?: string; reconnect?: boolean };
			if (!response.ok) throw Object.assign(new Error(data.error ?? "Could not open that spreadsheet."), { reconnect: data.reconnect });
			const tab = data.sheets?.[0];
			if (!tab) throw new Error("That spreadsheet has no tabs to read.");
			const connection = await sheetApi.create(businessId, {
				spreadsheet_id: file.id, spreadsheet_name: file.name, sheet_gid: tab.sheetId, sheet_title: tab.title,
			});
			await queryClient.invalidateQueries({ queryKey: ["sheet-connections"] });
			router.push(`/apps/sheets/${connection.id}`);
		} catch (problem) {
			onError(problem instanceof Error ? problem.message : "Could not open that spreadsheet.", Boolean((problem as { reconnect?: boolean }).reconnect));
			setOpening(null);
		}
	}

	return (
		<div className="flex flex-col gap-2">
			{opening ? (
				<span className="text-[13px] opacity-70">Reading {opening}…</span>
			) : (
				<SheetPicker onPick={(file) => void pick(file)} onError={onError} />
			)}
			{error ? (
				<p className="m-0 text-[12.5px] text-destructive">
					{error}{" "}
					{needsReconnect ? (
						<button
							type="button"
							onClick={() => void connectGoogleSheets(returnTo).then((problem) => problem && onError(problem))}
							className="font-semibold underline underline-offset-2"
						>
							Reconnect Google
						</button>
					) : null}
				</p>
			) : null}
		</div>
	);
}
