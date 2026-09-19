"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
	documentId: string;
	spreadsheetId: string;
	spreadsheetName: string;
	sheetName: string;
};

export function GoogleSheetReplacement({
	documentId,
	spreadsheetId,
	spreadsheetName,
	sheetName,
}: Props) {
	const router = useRouter();
	const [status, setStatus] = useState<"idle" | "importing" | "error">("idle");
	const [error, setError] = useState("");

	async function replaceSheet() {
		setStatus("importing");
		setError("");
		try {
			const response = await fetch("/api/integrations/google-sheets/import", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					spreadsheetId,
					spreadsheetName,
					sheetName,
					replaceDocumentId: documentId,
				}),
			});
			if (!response.ok) {
				const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
				throw new Error(body.error?.message ?? "Could not replace the existing document.");
			}
			router.replace("/documents");
		} catch (replacementError) {
			setStatus("error");
			setError(replacementError instanceof Error ? replacementError.message : "Could not replace the existing document.");
		}
	}

	return (
		<div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-[12.5px]">
			<div className="min-w-0 flex-1">
				<div className="font-semibold">This sheet has already been imported.</div>
				<div className="opacity-70">Replace the existing document with the latest sheet data?</div>
				{error && <div className="mt-1 text-destructive">{error}</div>}
			</div>
			<button
				type="button"
				disabled={status === "importing"}
				onClick={() => void replaceSheet()}
				className="shrink-0 rounded-full bg-foreground px-3.5 py-2 text-background disabled:opacity-50"
			>
				{status === "importing" ? "Replacing..." : "Replace existing"}
			</button>
		</div>
	);
}
