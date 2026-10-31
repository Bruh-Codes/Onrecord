/**
 * Connected spreadsheets: OnRecord keeps reading a chosen Google Sheets tab and
 * adds new rows to Records on its own. The API does the reading and sorting;
 * these hooks only show its state and pass on the owner's choices.
 */

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "@/lib/api";

export const SHEET_FIELDS = [
	{ key: "date", label: "Date", required: true },
	{ key: "description", label: "What it was for (details)" },
	{ key: "money_in", label: "Money in" },
	{ key: "money_out", label: "Money out" },
	{ key: "amount", label: "Amount (one column for both)" },
	{ key: "direction", label: "In or out (type)" },
	{ key: "category", label: "Category" },
	{ key: "counterparty", label: "Customer or supplier" },
	{ key: "payment_method", label: "Paid by (cash, MoMo, bank)" },
	{ key: "reference", label: "Receipt or reference number" },
	{ key: "product", label: "Product or service" },
] as const;

export type SheetField = (typeof SHEET_FIELDS)[number]["key"];

export type SheetMapping = {
	header_row: number;
	columns: Partial<Record<SheetField, number | null>>;
	default_direction: "in" | "out" | null;
	date_order: "dmy" | "mdy";
};

export type SheetStatus = "needs_mapping" | "active" | "paused" | "needs_attention" | "disconnected";

export type SheetConnection = {
	id: string;
	business_id: string;
	spreadsheet_id: string;
	spreadsheet_name: string;
	sheet_gid: number;
	sheet_title: string;
	status: SheetStatus;
	mapping: SheetMapping | null;
	mapping_confirmed_at: string | null;
	document_id: string | null;
	last_checked_at: string | null;
	last_synced_at: string | null;
	last_error: string | null;
	last_result: { added?: number; edited?: number; removed?: number; needs_review?: number; rows_in_sheet?: number };
	counts: Partial<Record<"recorded" | "needs_review" | "removed" | "skipped" | "kept" | "to_review" | "in_ledger", number>>;
	created_at: string;
};

export type SheetRecord = {
	occurred_on: string;
	direction: "in" | "out";
	amount_pesewas: number;
	description: string | null;
	category_text: string | null;
	counterparty: string | null;
};

export type SheetRowReason = "unreadable" | "possible_duplicate" | "large_amount" | "old_edit" | "old_removal";
export type SheetRowAction = "skip" | "add" | "accept" | "keep" | "remove";

export type SheetHistoryEvent = {
	event: "edited_in_sheet" | "removed_from_sheet" | "back_in_sheet" | "owner_review" | "removed_from_ledger";
	at: string;
	before?: Partial<SheetRecord>;
	action?: SheetRowAction;
};

export type SheetRow = {
	id: string;
	row_number: number;
	values: string[];
	parsed: SheetRecord | null;
	status: string;
	review_reason: SheetRowReason | null;
	actions: SheetRowAction[];
	transaction_id: string | null;
	first_seen_at: string;
	history: SheetHistoryEvent[];
};

export type SheetConnectionDetail = SheetConnection & { review_rows: SheetRow[]; changed_rows: SheetRow[] };

export type SheetPreview = {
	mapping: SheetMapping;
	header: string[];
	columns: string[];
	rows: { row_number: number; values: string[]; record: SheetRecord | null; issues: string[] }[];
	problems: string[];
	data_rows: number;
};

const json = (body: unknown) => ({ body: JSON.stringify(body) });

export const sheetApi = {
	list: (businessId: string) => request<SheetConnection[]>(`/v1/businesses/${businessId}/sheet-connections`),
	create: (businessId: string, body: { spreadsheet_id: string; spreadsheet_name: string; sheet_gid: number; sheet_title: string }) =>
		request<SheetConnection>(`/v1/businesses/${businessId}/sheet-connections`, { method: "POST", ...json(body) }),
	get: (id: string) => request<SheetConnectionDetail>(`/v1/sheet-connections/${id}`),
	preview: (id: string, mapping?: SheetMapping) =>
		request<SheetPreview>(`/v1/sheet-connections/${id}/preview`, { method: "POST", ...json({ mapping: mapping ?? null }) }),
	confirm: (id: string, mapping: SheetMapping) =>
		request<SheetConnection>(`/v1/sheet-connections/${id}/mapping`, { method: "PUT", ...json({ mapping }) }),
	sync: (id: string) => request<{ queued: boolean }>(`/v1/sheet-connections/${id}/sync`, { method: "POST" }),
	syncStale: (businessId: string) =>
		request<{ queued: number }>(`/v1/businesses/${businessId}/sheet-connections/sync-stale`, { method: "POST" }),
	pause: (id: string) => request<SheetConnection>(`/v1/sheet-connections/${id}/pause`, { method: "POST" }),
	resume: (id: string) => request<SheetConnection>(`/v1/sheet-connections/${id}/resume`, { method: "POST" }),
	disconnect: (id: string) => request<void>(`/v1/sheet-connections/${id}`, { method: "DELETE" }),
	review: (rowId: string, action: SheetRowAction) =>
		request<SheetRow>(`/v1/sheet-rows/${rowId}/review`, { method: "POST", ...json({ action }) }),
};

export function useSheetConnections(businessId: string | null) {
	return useQuery({
		queryKey: ["sheet-connections", businessId],
		queryFn: () => sheetApi.list(businessId!),
		enabled: !!businessId,
	});
}

export function useSheetConnection(id: string | null) {
	return useQuery({
		queryKey: ["sheet-connection", id],
		queryFn: () => sheetApi.get(id!),
		enabled: !!id,
		// A sync runs in the background; keep the page current while one may be running.
		refetchInterval: 15_000,
	});
}

/** Anything that changes the ledger refreshes the pages that show it. */
export function useSheetMutation<T, V = void>(fn: (variables: V) => Promise<T>) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: fn,
		onSettled: () => {
			for (const key of ["sheet-connection", "sheet-connections", "money-summary", "money-transactions", "transactions", "documents", "notifications"]) {
				void queryClient.invalidateQueries({ queryKey: [key] });
			}
		},
	});
}

/** Opening the app checks sheets nobody has looked at lately, so records stay
 *  current even when the background sweep isn't running. */
export function useSheetCatchUp(businessId: string | null) {
	useEffect(() => {
		if (!businessId) return;
		void sheetApi.syncStale(businessId).catch(() => undefined);
	}, [businessId]);
}

export const STATUS_TEXT: Record<SheetStatus, { label: string; tone: "positive" | "warning" | "negative" | "neutral" }> = {
	active: { label: "Syncing", tone: "positive" },
	needs_mapping: { label: "Confirm columns", tone: "warning" },
	needs_attention: { label: "Needs attention", tone: "negative" },
	paused: { label: "Paused", tone: "neutral" },
	disconnected: { label: "Disconnected", tone: "neutral" },
};

export const REASON_TEXT: Record<SheetRowReason, string> = {
	unreadable: "OnRecord couldn't read this row. Fix it in your sheet and it will be picked up on the next sync, or skip it.",
	possible_duplicate: "This looks like a record you already typed into OnRecord. Skip it so it isn't counted twice?",
	large_amount: "This is much bigger than your usual records. Check it's right before it counts.",
	old_edit: "This row is more than 30 days old and was changed in your sheet. OnRecord still uses the earlier figures until you accept the change.",
	old_removal: "This row is more than 30 days old and was deleted from your sheet. It still counts until you confirm.",
};

export const ACTION_TEXT: Record<SheetRowAction, string> = {
	skip: "Skip it",
	add: "Add it",
	accept: "Use the new figures",
	keep: "Keep the earlier record",
	remove: "Remove it",
};

export function timeAgo(iso: string | null): string {
	if (!iso) return "never";
	const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours} h ago`;
	return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Accra" });
}
