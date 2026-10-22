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
		<div className="px-4 sm:px-10 py-6 sm:py-8 pb-16 max-w-[1200px] mx-auto">
			<Link
				href="/money"
				className="text-[13px] inline-flex items-center gap-1 mb-3.5"
			>
				<BackArrowIcon />
				Back to money
			</Link>
			<div className="mb-1.5 text-[11px] tracking-wider uppercase text-foreground/55">
				Sort transactions
			</div>

			<h1 className="text-[24px] sm:text-[30px] m-0 mb-1.5">
				What was this money for?
			</h1>
			<p className="text-sm opacity-75 m-0 mb-6.5">
				{openCount} transaction{openCount === 1 ? "" : "s"} we couldn&apos;t sort
				on our own. Tell us whether each one was a sale, a cost, a loan or
				something else, so lenders see your true sales and costs. Transfers
				between your own accounts are already left out.
			</p>

			{queue.isLoading ? (
				<div className="rounded-[20px] bg-muted p-6 text-sm text-foreground/65">
					Loading transactions that need review…
				</div>
			) : null}
			{queue.isError ? (
				<div className="rounded-[20px] border border-destructive/30 bg-destructive-background p-6 text-sm text-destructive">
					We could not load the classification queue. Try refreshing the page.
				</div>
			) : null}
			{!queue.isLoading && !queue.isError && items.length === 0 ? (
				<div className="rounded-[20px] bg-muted p-8 text-center">
					<div className="text-lg font-semibold mb-1">
						Nothing to sort right now
					</div>
					<div className="text-sm text-foreground/60 mb-4">
						When a new statement has transactions we can&apos;t place, they
						will show up here.
					</div>
					<Link
						href="/money"
						className="inline-flex rounded-full bg-foreground px-4 py-2 text-sm text-background"
					>
						Back to money
					</Link>
				</div>
			) : null}
			{selectedItem ? (
				<div className="grid gap-6 items-start grid-cols-1 lg:grid-cols-[1.3fr_1fr]">
					<div>
						<ReviewTable
							items={items}
							selectedId={selectedId}
							onSelect={setSelectedId}
						/>
						{saved && (
							<div className="mt-3 text-xs text-positive">
								Saved. Your money and health pages are updating.
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
