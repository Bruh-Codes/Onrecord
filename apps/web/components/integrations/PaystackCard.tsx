"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/hooks/use-business";
import { paystackApi, usePaystack, usePaystackMutation } from "@/lib/paystack";
import { timeAgo } from "@/lib/sheet-sync";

const linkButton = "text-[12px] opacity-70 underline underline-offset-2 disabled:opacity-40";

/** The Paystack card: paste the secret key once, then payments come in by themselves. */
export function PaystackCard({ header }: { header: ReactNode }) {
	const { businessId } = useMe();
	const connection = usePaystack(businessId);
	const [formOpen, setFormOpen] = useState(false);
	const [confirmDisconnect, setConfirmDisconnect] = useState(false);
	const [syncQueued, setSyncQueued] = useState(false);

	const sync = usePaystackMutation(() => paystackApi.sync(businessId!));
	const disconnect = usePaystackMutation(() => paystackApi.disconnect(businessId!));

	const current = connection.data ?? null;
	const showForm = !current ? formOpen : current.status === "needs_attention";

	let action: ReactNode;
	if (connection.isLoading || !businessId) action = <span className="text-[12px] opacity-60">Checking…</span>;
	else if (connection.isError) action = <span className="text-[11px] text-destructive">Couldn&apos;t check Paystack.</span>;
	else if (!current) {
		action = formOpen ? null : (
			<button type="button" onClick={() => setFormOpen(true)} className="shrink-0 bg-foreground text-background text-[13px] px-4.5 py-2.5 rounded-full">
				Connect
			</button>
		);
	} else {
		action = (
			<div className="flex items-center gap-2">
				{current.mode === "test" ? <Badge tone="neutral">Test mode</Badge> : null}
				{current.status === "active" ? <Badge tone="positive">Connected</Badge> : <Badge tone="negative">Needs attention</Badge>}
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4 p-5 border border-foreground/12 rounded-2xl">
			<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
				{header}
				{action ? <div className="basis-full pl-15 sm:basis-auto sm:pl-0">{action}</div> : null}
			</div>

			{current ? (
				<div className="flex flex-col gap-2 rounded-xl border border-foreground/12 px-4 py-3">
					<div className="text-[13.5px] font-semibold">
						{current.payments} {current.payments === 1 ? "payment" : "payments"} in your records
					</div>
					<div className="text-[12px] opacity-65">
						Key ending {current.key_last4} · checked {syncQueued && sync.isPending ? "now" : timeAgo(current.last_checked_at)}
					</div>
					{current.status === "needs_attention" && current.last_error ? (
						<div className="text-[12px] text-destructive">{current.last_error}</div>
					) : null}
					<div className="flex flex-wrap items-center gap-3 pt-1">
						{current.status === "active" ? (
							<button
								type="button"
								className={linkButton}
								disabled={sync.isPending}
								onClick={() => {
									setSyncQueued(true);
									sync.mutate(undefined, { onSettled: () => setTimeout(() => setSyncQueued(false), 4000) });
								}}
							>
								{syncQueued ? "Syncing…" : "Sync now"}
							</button>
						) : null}
						{confirmDisconnect ? (
							<span className="flex items-center gap-2 text-[12px]">
								<span className="opacity-70">Stop syncing and delete the key? Your records stay.</span>
								<button type="button" className={`${linkButton} text-destructive`} disabled={disconnect.isPending} onClick={() => disconnect.mutate(undefined, { onSuccess: () => setConfirmDisconnect(false) })}>
									Disconnect
								</button>
								<button type="button" className={linkButton} onClick={() => setConfirmDisconnect(false)}>Cancel</button>
							</span>
						) : (
							<button type="button" className={linkButton} onClick={() => setConfirmDisconnect(true)}>Disconnect</button>
						)}
					</div>
				</div>
			) : null}

			{showForm && businessId ? (
				<KeyForm businessId={businessId} replacing={!!current} onCancel={current ? undefined : () => setFormOpen(false)} />
			) : null}
		</div>
	);
}

function KeyForm({ businessId, replacing, onCancel }: { businessId: string; replacing: boolean; onCancel?: () => void }) {
	const [key, setKey] = useState("");
	const [error, setError] = useState("");
	const connect = usePaystackMutation((secretKey: string) => paystackApi.connect(businessId, secretKey));

	function submit(event: FormEvent) {
		event.preventDefault();
		setError("");
		connect.mutate(key.trim(), {
			onSuccess: () => setKey(""),
			onError: (problem) => setError(problem instanceof ApiError ? problem.message : "Couldn't connect Paystack. Try again."),
		});
	}

	return (
		<form onSubmit={submit} className="flex flex-col gap-2.5">
			<label htmlFor="paystack-key" className="text-[13px] font-semibold">
				{replacing ? "Paste your current secret key" : "Paste your Paystack secret key"}
			</label>
			<div className="flex flex-col gap-2 sm:flex-row">
				<input
					id="paystack-key"
					type="password"
					autoComplete="off"
					spellCheck={false}
					placeholder="sk_live_…"
					value={key}
					onChange={(event) => setKey(event.target.value)}
					className="min-w-0 flex-1 rounded-xl border border-foreground/15 bg-background px-3.5 py-2.5 font-mono text-[13px] outline-none focus:border-foreground/40"
				/>
				<div className="flex items-center gap-3">
					<button
						type="submit"
						disabled={!key.trim() || connect.isPending}
						className="shrink-0 bg-foreground text-background text-[13px] px-4.5 py-2.5 rounded-full disabled:opacity-50"
					>
						{connect.isPending ? "Checking…" : "Connect"}
					</button>
					{onCancel ? <button type="button" className={linkButton} onClick={onCancel}>Cancel</button> : null}
				</div>
			</div>
			{error ? <div className="text-[12px] text-destructive">{error}</div> : null}
			<p className="m-0 text-[12px] opacity-65">
				Find it in Paystack under Settings, then API Keys &amp; Webhooks. OnRecord only reads your payments and never moves
				money. The key is stored encrypted.
			</p>
		</form>
	);
}
