export function Skeleton({ className = "" }: { className?: string }) {
	return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-panel ${className}`} />;
}

export function DocumentRowSkeleton() {
	return (
		<div
			aria-hidden="true"
			className="py-3 border-b border-border flex items-center gap-3.5"
		>
			<div className="w-[34px] h-[34px] shrink-0 rounded-[10px] bg-panel flex items-center justify-center">
				<Skeleton className="w-[14px] h-[14px] rounded" />
			</div>
			<div className="flex-1 min-w-0 space-y-1.5">
				<Skeleton className="h-3.5 w-2/5" />
				<Skeleton className="h-3 w-1/3" />
			</div>
			<div className="shrink-0 flex items-center gap-2">
				<Skeleton className="h-6 w-24 rounded-full" />
				<Skeleton className="h-7 w-[68px] rounded-full" />
			</div>
		</div>
	);
}

export function CounterpartyRowSkeleton() {
	return (
		<div
			aria-hidden="true"
			className="flex items-start gap-3 py-4 border-b border-border"
		>
			<div className="flex-1 min-w-0 space-y-2">
				<div className="flex items-center gap-2">
					<Skeleton className="h-4 w-1/3" />
					<Skeleton className="h-2.5 w-12" />
				</div>
				<Skeleton className="h-3 w-1/2" />
			</div>
			<div className="text-right shrink-0 space-y-2">
				<Skeleton className="h-4 w-16 ml-auto" />
				<Skeleton className="h-6 w-20 rounded-full ml-auto" />
			</div>
		</div>
	);
}

export function GapRowSkeleton() {
	return (
		<div aria-hidden="true" className="py-4 border-b border-border">
			<div className="flex justify-between items-start gap-2.5 mb-1">
				<Skeleton className="h-3.5 w-3/5" />
				<Skeleton className="h-5 w-14 rounded-full shrink-0" />
			</div>
			<Skeleton className="h-3 w-3/5 mb-2.5" />
			<div className="flex gap-2">
				<Skeleton className="h-7 w-24 rounded-full" />
				<Skeleton className="h-7 w-28 rounded-full" />
			</div>
		</div>
	);
}

export function GapItemSkeleton() {
	return (
		<div aria-hidden="true" className="py-3 border-b border-border">
			<div className="flex justify-between items-start gap-2.5">
				<Skeleton className="h-3.5 w-2/3" />
				<Skeleton className="h-5 w-14 rounded-full shrink-0" />
			</div>
			<Skeleton className="h-3 w-1/2 mt-1.5" />
		</div>
	);
}

export function TransactionValueBreakdownSkeleton() {
	return (
		<div aria-hidden="true">
			<Skeleton className="h-4 w-28 mb-3.5" />
			<Skeleton className="h-6 rounded-lg mb-4" />
			<div className="flex flex-col gap-2.5">
				{[0, 1, 2, 3].map((i) => (
					<div key={i} className="flex items-center gap-2">
						<Skeleton className="w-[9px] h-[9px] rounded-full" />
						<Skeleton className="h-3.5 w-20" />
						<Skeleton className="h-3.5 w-16 ml-auto" />
					</div>
				))}
			</div>
		</div>
	);
}

export function TrendChartSkeleton() {
	return (
		<div aria-hidden="true">
			<Skeleton className="h-3.5 w-32 mb-1.5" />
			<Skeleton className="h-7 w-28 mb-1" />
			<Skeleton className="h-3 w-40 mb-3" />
			<Skeleton className="h-[90px] rounded-lg mb-1" />
			<div className="flex justify-between">
				<Skeleton className="h-2.5 w-10" />
				<Skeleton className="h-2.5 w-10" />
			</div>
		</div>
	);
}

export function GapsAndCoverageSkeleton() {
	return (
		<div
			aria-hidden="true"
			className="grid gap-[52px] grid-cols-1 lg:grid-cols-[1.3fr_1fr_1fr]"
		>
			<div>
				<Skeleton className="h-4 w-16 mb-3" />
				<GapItemSkeleton />
				<GapItemSkeleton />
				<GapItemSkeleton />
			</div>
			<div>
				<Skeleton className="h-3.5 w-28 mb-1.5" />
				<Skeleton className="h-6 w-32 mb-1" />
				<Skeleton className="h-3 w-40 mb-3" />
				<div className="flex justify-between">
					<Skeleton className="h-2.5 w-10" />
					<Skeleton className="h-2.5 w-10" />
				</div>
				<Skeleton className="h-[70px] rounded-lg" />
			</div>
			<div>
				<Skeleton className="h-4 w-36 mb-3" />
				{[0, 1].map((i) => (
					<div key={i} className="mb-3 space-y-1.5">
						<Skeleton className="h-3.5 w-1/2" />
						<Skeleton className="h-2.5 w-2/3" />
						<Skeleton className="h-3.5 w-16" />
					</div>
				))}
			</div>
		</div>
	);
}

export function OverviewPageSkeleton() {
	return (
		<div
			className="flex-1 min-w-0 px-4 sm:px-7 pt-6 sm:pt-7.5 pb-10"
			aria-busy="true"
			aria-label="Loading readiness overview"
		>
			<Skeleton className="h-9 w-72 mb-2" />
			<Skeleton className="h-4 w-[400px] max-w-full mb-10" />
			<Skeleton className="h-3 w-36 mb-4.5" />
			<div className="grid gap-[52px] mb-12 grid-cols-1 lg:grid-cols-[1fr_1.3fr_1.3fr]">
				<TransactionValueBreakdownSkeleton />
				<TrendChartSkeleton />
				<TrendChartSkeleton />
			</div>
			<div className="h-px bg-border mb-10" />
			<Skeleton className="h-3 w-28 mb-4.5" />
			<GapsAndCoverageSkeleton />
		</div>
	);
}