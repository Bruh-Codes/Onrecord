/**
 * Connected Paystack: the owner pastes their secret key once and OnRecord
 * reads their payments every few minutes. The key never comes back from the
 * API; only its last 4 characters do.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "@/lib/api";

export type PaystackConnection = {
	id: string;
	status: "active" | "needs_attention" | "disconnected";
	mode: "test" | "live";
	key_last4: string;
	last_checked_at: string | null;
	last_synced_at: string | null;
	last_error: string | null;
	last_result: { payments?: number; refunds?: number; payouts?: number; other_currency?: number };
	payments: number;
	records: number;
	created_at: string;
};

const base = (businessId: string) => `/v1/businesses/${businessId}/paystack`;

export const paystackApi = {
	get: (businessId: string) => request<PaystackConnection | null>(base(businessId)),
	connect: (businessId: string, secretKey: string) =>
		request<PaystackConnection>(base(businessId), { method: "PUT", body: JSON.stringify({ secret_key: secretKey }) }),
	sync: (businessId: string) => request<{ queued: boolean }>(`${base(businessId)}/sync`, { method: "POST" }),
	disconnect: (businessId: string) => request<void>(base(businessId), { method: "DELETE" }),
};

export function usePaystack(businessId: string | null) {
	return useQuery({
		queryKey: ["paystack", businessId],
		queryFn: () => paystackApi.get(businessId!),
		enabled: !!businessId,
		// Syncs run in the background; keep the card current.
		refetchInterval: 15_000,
	});
}

/** Anything that changes the ledger refreshes the pages that show it. */
export function usePaystackMutation<T, V = void>(fn: (variables: V) => Promise<T>) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: fn,
		onSettled: () => {
			for (const key of ["paystack", "money-summary", "money-transactions", "transactions", "documents"]) {
				void queryClient.invalidateQueries({ queryKey: [key] });
			}
		},
	});
}
