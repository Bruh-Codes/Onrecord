"use client";

import { useEffect, useState } from "react";
import { GOOGLE_PICKER, GOOGLE_PICKER_ENABLED } from "@/lib/google-sheets";

export type PickedSpreadsheet = { id: string; name: string };

type PickerDoc = { id: string; name: string };
type PickerResponse = { action: string; docs?: PickerDoc[] };
type PickerBuilder = {
	addView: (view: unknown) => PickerBuilder;
	setOAuthToken: (token: string) => PickerBuilder;
	setDeveloperKey: (key: string) => PickerBuilder;
	setAppId: (id: string) => PickerBuilder;
	setTitle: (title: string) => PickerBuilder;
	setCallback: (callback: (response: PickerResponse) => void) => PickerBuilder;
	build: () => { setVisible: (visible: boolean) => void };
};
type GooglePickerApi = {
	picker: {
		PickerBuilder: new () => PickerBuilder;
		DocsView: new (viewId: unknown) => { setMode: (mode: unknown) => unknown };
		ViewId: { SPREADSHEETS: unknown };
		DocsViewMode: { LIST: unknown };
		Action: { PICKED: string };
	};
};
declare global {
	interface Window {
		gapi?: { load: (name: string, callback: () => void) => void };
		google?: GooglePickerApi;
	}
}

function loadPicker(): Promise<void> {
	return new Promise((resolve, reject) => {
		const ready = () => window.gapi!.load("picker", () => resolve());
		if (window.gapi) return ready();
		const script = document.createElement("script");
		script.src = "https://apis.google.com/js/api.js";
		script.async = true;
		script.onload = ready;
		script.onerror = () => reject(new Error("Google's file picker could not load."));
		document.head.appendChild(script);
	});
}

/** Google's own file picker when it's configured (OnRecord then sees only the
 *  file picked), otherwise a list of the owner's spreadsheets. */
export function SheetPicker({ onPick, onError }: { onPick: (file: PickedSpreadsheet) => void; onError: (message: string) => void }) {
	const [files, setFiles] = useState<PickedSpreadsheet[] | null>(null);
	const [opening, setOpening] = useState(false);

	useEffect(() => {
		if (GOOGLE_PICKER_ENABLED) return;
		void fetch("/api/integrations/google-sheets/files")
			.then(async (response) => ({ response, data: (await response.json()) as { files?: PickedSpreadsheet[]; error?: string } }))
			.then(({ response, data }) => {
				if (!response.ok) return onError(data.error ?? "Could not load your Google Sheets.");
				setFiles(data.files ?? []);
			})
			.catch(() => onError("Could not load your Google Sheets."));
	}, [onError]);

	async function openPicker() {
		setOpening(true);
		try {
			const response = await fetch("/api/integrations/google-sheets/token");
			const data = (await response.json()) as { accessToken?: string; error?: string };
			if (!response.ok || !data.accessToken) throw new Error(data.error ?? "Connect Google Sheets first.");
			await loadPicker();
			const picker = window.google!.picker;
			const view = new picker.DocsView(picker.ViewId.SPREADSHEETS);
			view.setMode(picker.DocsViewMode.LIST);
			new picker.PickerBuilder()
				.addView(view)
				.setOAuthToken(data.accessToken)
				.setDeveloperKey(GOOGLE_PICKER.apiKey)
				.setAppId(GOOGLE_PICKER.appId)
				.setTitle("Choose the spreadsheet OnRecord should keep reading")
				.setCallback((result) => {
					const doc = result.docs?.[0];
					if (result.action === picker.Action.PICKED && doc) onPick({ id: doc.id, name: doc.name });
				})
				.build()
				.setVisible(true);
		} catch (error) {
			onError(error instanceof Error ? error.message : "Google's file picker could not open.");
		} finally {
			setOpening(false);
		}
	}

	if (GOOGLE_PICKER_ENABLED) {
		return (
			<button type="button" onClick={() => void openPicker()} disabled={opening} className="self-start rounded-full bg-foreground px-4.5 py-2.5 text-[13px] text-background disabled:opacity-50">
				{opening ? "Opening Google Drive..." : "Choose from Google Drive"}
			</button>
		);
	}
	if (files === null) return <span className="text-[12.5px] opacity-60">Loading your spreadsheets...</span>;
	if (files.length === 0) return <span className="text-[12.5px] opacity-60">No Google Sheets were found in this account.</span>;
	return (
		<select
			defaultValue=""
			onChange={(event) => {
				const file = files.find((item) => item.id === event.target.value);
				if (file) onPick(file);
			}}
			className="w-full max-w-[440px] rounded-xl border border-border bg-background px-3 py-2.5 text-[13.5px]"
		>
			<option value="">Choose a spreadsheet</option>
			{files.map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}
		</select>
	);
}
