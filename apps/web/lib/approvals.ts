/**
 * Approvals: uploads held out of readiness until a reviewer approves them.
 * Admins see every business; reviewers see businesses they were granted.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, request } from "@/lib/api";
import type { Role } from "@/lib/api-types";

export type ApprovalFinding = { code: string; severity: string; reason: string };

export type ApprovalItem = {
	document_id: string;
	business_id: string;
	business_name: string;
	filename: string;
	mime: string;
	doc_type: string | null;
	issuer: string | null;
	period_start: string | null;
	period_end: string | null;
	document_status: string;
	uploaded_at: string;
	review_status: "pending" | "warning" | "error" | "approved" | "rejected" | string;
	risk_level: string;
	summary: string;
	findings: ApprovalFinding[];
	balance_check: "reconciled" | "balance_breaks" | "unverifiable" | null;
	incomplete_read: boolean;
	waiting_on_owner: boolean;
	rows_read: number | null;
	transaction_count: number;
	money_in_pesewas: number;
	money_out_pesewas: number;
	reviewed_by: string | null;
	reviewed_at: string | null;
	reviewer_note: string | null;
};

export type ApprovalState = "open" | "done";

export function canReview(role: Role | undefined | null): boolean {
	return role === "admin" || role === "reviewer";
}

export function useApprovals(state: ApprovalState, enabled: boolean) {
	return useQuery({
		queryKey: ["approvals", state],
		queryFn: () => request<ApprovalItem[]>(`/v1/approvals?state=${state}`),
		enabled,
	});
}

/** Count of uploads waiting, for the badge on the Approvals link. */
export function useApprovalsSummary(enabled: boolean) {
	return useQuery({
		queryKey: ["approvals", "summary"],
		queryFn: () => request<{ open: number }>("/v1/approvals/summary"),
		enabled,
		refetchInterval: 60_000,
		refetchOnWindowFocus: true,
	});
}

export type DraftNote = { recommendation: "approved" | "rejected"; note: string; source: "ona" | "template" };

/** Ona's suggested decision and note. Saves and sends nothing. */
export function useDraftNote() {
	return useMutation({
		mutationFn: (documentId: string) =>
			request<DraftNote>(`/v1/approvals/${documentId}/draft-note`, { method: "POST" }),
	});
}

export function useResolveApproval() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ documentId, decision, note }: { documentId: string; decision: "approved" | "rejected"; note: string }) =>
			request(`/v1/documents/${documentId}/evidence-review/resolve`, {
				method: "POST",
				body: JSON.stringify({ decision, note }),
			}),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["approvals"] });
		},
	});
}

/** Open the original upload in a new tab. The file needs the API token, so it
 * is fetched here and handed to the browser as a blob URL. */
export async function openOriginalFile(documentId: string): Promise<void> {
	const tab = window.open("", "_blank");
	try {
		const tokenRes = await fetch("/api/auth/token", { headers: { Accept: "application/json" } });
		const { token } = (await tokenRes.json()) as { token?: string };
		if (!token) throw new ApiError(401, "UNAUTHORIZED", "Please sign in again.");
		const base =
			process.env.NEXT_PUBLIC_BACKEND_URL ??
			process.env.NEXT_PUBLIC_API_URL ??
			process.env.NEXT_PUBLIC_API_BASE_URL ??
			"http://localhost:8000";
		const res = await fetch(`${base}/v1/approvals/${documentId}/file`, {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (!res.ok) throw new ApiError(res.status, "FILE_UNAVAILABLE", "The original file couldn't be opened.");
		const url = URL.createObjectURL(await res.blob());
		if (tab) tab.location.href = url;
		else window.location.href = url;
		setTimeout(() => URL.revokeObjectURL(url), 60_000);
	} catch (error) {
		tab?.close();
		throw error;
	}
}
