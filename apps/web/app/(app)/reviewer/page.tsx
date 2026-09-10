"use client";

import { useState } from "react";
import Link from "next/link";
import { BackArrowIcon } from "@/components/icons";
import { ReviewDetailPanel } from "@/components/reviewer/ReviewDetailPanel";
import { ReviewTable } from "@/components/reviewer/ReviewTable";
import {
	useClassifyTransaction,
	useMe,
	useTransactionReviewQueue,
} from "@/lib/hooks/use-business";

export default function ReviewerQueuePage() {
	const { businessId } = useMe();
	const queue = useTransactionReviewQueue(businessId);
	const classify = useClassifyTransaction(businessId);
	const items = queue.data ?? [];
	const [selectedIdState, setSelectedId] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);
	const selectedId = items.some((item) => item.id === selectedIdState)
		? selectedIdState
		: (items[0]?.id ?? null);
	const selectedItem = items.find((item) => item.id === selectedId) ?? null;
	const openCount = items.length;
	const handleSave = (category: string) => {
		if (!selectedItem) return;
		setSaved(false);
		classify.mutate(
			{ transactionId: selectedItem.id, category_l1: category },
			{ onSuccess: () => setSaved(true) },
		);
	};

	return (
		<div className="px-10 py-8 pb-16 max-w-[1200px] mx-auto animate-fade-in">
			<Link
				href="/overview"
				className="text-[13px] inline-flex items-center gap-1 mb-3.5"
			>
				<BackArrowIcon />
				Back to overview
			</Link>
			<div className="mb-1.5 text-[11px] tracking-wider uppercase text-ink/55">
				Classification queue
			</div>

			<h1 className="text-[30px] m-0 mb-1.5">
				Resolve unclassified transactions
			</h1>
			<p className="text-sm opacity-75 m-0 mb-6.5">
				{openCount} unresolved transactions in the current analysis window need
				a category before they can improve revenue, expense, or cashflow
				insights. Internal transfers, duplicates, FX, and reversals are
				excluded.
			</p>

			{queue.isLoading ? (
				<div className="rounded-[20px] bg-panel p-6 text-sm text-ink/65">
					Loading transactions that need review…
				</div>
			) : null}
			{queue.isError ? (
				<div className="rounded-[20px] border border-negative/30 bg-negative-bg p-6 text-sm text-negative">
					We could not load the classification queue. Try refreshing the page.
				</div>
			) : null}
			{!queue.isLoading && !queue.isError && items.length === 0 ? (
				<div className="rounded-[20px] bg-panel p-8 text-center">
					<div className="text-lg font-semibold mb-1">
						No pending classification decisions
					</div>
					<div className="text-sm text-ink/60 mb-4">
						New statement uploads will appear here when the model cannot make a
						confident decision. Transactions deliberately left unclassified
						remain visible in your insights.
					</div>
					<Link
						href="/overview"
						className="inline-flex rounded-full bg-ink px-4 py-2 text-sm text-paper"
					>
						Return to overview
					</Link>
				</div>
			) : null}
			{selectedItem ? (
				<div
					className="grid gap-6 items-start"
					style={{ gridTemplateColumns: "1.3fr 1fr" }}
				>
					<div>
						<ReviewTable
							items={items}
							selectedId={selectedId}
							onSelect={setSelectedId}
						/>
						{saved && (
							<div className="mt-3 text-xs text-positive">
								Saved. The queue and overview are refreshing.
							</div>
						)}
					</div>
					<ReviewDetailPanel
						key={selectedItem.id}
						item={selectedItem}
						onSave={handleSave}
						busy={classify.isPending}
					/>
				</div>
			) : null}
		</div>
	);
}
