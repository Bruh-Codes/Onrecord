export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
	return <div aria-hidden="true" style={style} className={`animate-pulse rounded-lg bg-muted ${className}`} />;
}

export function DocumentRowSkeleton() {
	return (
		<div
			aria-hidden="true"
			className="py-3 border-b border-border flex items-center gap-3.5"
		>
			<div className="w-[34px] h-[34px] shrink-0 rounded-[10px] bg-muted flex items-center justify-center">
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

export function StatCardSkeleton() {
	return (
		<div aria-hidden="true" className="rounded-2xl border border-border bg-card p-4">
			<Skeleton className="h-3 w-20" />
			<Skeleton className="mt-2.5 h-7 w-32 max-w-full" />
			<Skeleton className="mt-2 h-2.5 w-24" />
		</div>
	);
}

/** Bars of varied height so the placeholder reads as a chart, not a block. */
export function ChartSkeleton({ bars = 12, height = 180 }: { bars?: number; height?: number }) {
	const heights = [55, 72, 40, 88, 64, 50, 78, 45, 92, 60, 70, 48];
	return (
		<div aria-hidden="true" className="flex items-end gap-2" style={{ height }}>
			{Array.from({ length: bars }, (_, i) => (
				<div key={i} className="flex flex-1 items-end gap-0.5 h-full">
					<Skeleton className="flex-1 rounded-md" style={{ height: `${heights[i % heights.length]}%` }} />
					<Skeleton className="flex-1 rounded-md" style={{ height: `${heights[(i + 5) % heights.length] * 0.7}%` }} />
				</div>
			))}
		</div>
	);
}

export function ListRowSkeleton({ withAmount = true }: { withAmount?: boolean }) {
	return (
		<div aria-hidden="true" className="flex items-center gap-3 border-t border-border py-3 first:border-t-0">
			<div className="min-w-0 flex-1 space-y-1.5">
				<Skeleton className="h-3.5 w-1/2" />
				<Skeleton className="h-2.5 w-1/3" />
			</div>
			{withAmount && <Skeleton className="h-4 w-20 shrink-0" />}
		</div>
	);
}

export function TransactionRowsSkeleton({ rows = 6 }: { rows?: number }) {
	return (
		<div aria-busy="true" aria-label="Loading transactions" className="mt-3">
			{Array.from({ length: rows }, (_, i) => <ListRowSkeleton key={i} />)}
		</div>
	);
}

export function PanelSkeleton({ rows = 3 }: { rows?: number }) {
	return (
		<div aria-hidden="true" className="rounded-2xl border border-border bg-card p-4 sm:p-5">
			<Skeleton className="h-4 w-36 mb-2" />
			{Array.from({ length: rows }, (_, i) => <ListRowSkeleton key={i} />)}
		</div>
	);
}

/** Money page body under its title. */
export function MoneyPageSkeleton() {
	return (
		<div aria-busy="true" aria-label="Loading your money picture">
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				{[0, 1, 2, 3].map((i) => <StatCardSkeleton key={i} />)}
			</div>
			<div className="mt-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
				<Skeleton className="h-4 w-32 mb-2" />
				<Skeleton className="h-2.5 w-56 max-w-full mb-5" />
				<ChartSkeleton />
			</div>
			<div className="mt-4 grid gap-4 md:grid-cols-2">
				<PanelSkeleton />
				<PanelSkeleton />
			</div>
		</div>
	);
}

/** The Lender summary paper, in outline. */
export function LenderSummarySkeleton() {
	return (
		<div
			aria-busy="true"
			aria-label="Preparing your summary"
			className="mx-auto overflow-hidden rounded-[18px] border border-border bg-card shadow-card"
		>
			<div className="h-1.5 bg-muted" aria-hidden="true" />
			<div aria-hidden="true" className="px-6 py-7 sm:px-10 sm:py-9">
				<div className="flex items-start justify-between gap-6">
					<Skeleton className="h-5 w-28" />
					<div className="flex flex-col items-end gap-1.5">
						<Skeleton className="h-3 w-40" />
						<Skeleton className="h-2.5 w-32" />
					</div>
				</div>
				<div className="mt-8 flex flex-wrap items-end justify-between gap-5 border-b border-border pb-6">
					<div className="space-y-2.5">
						<Skeleton className="h-8 w-64 max-w-full" />
						<Skeleton className="h-3.5 w-48" />
						<Skeleton className="h-3 w-56" />
					</div>
					<Skeleton className="h-[68px] w-44 rounded-xl" />
				</div>
				<div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border sm:grid-cols-4">
					{[0, 1, 2, 3].map((i) => (
						<div key={i} className="p-4 space-y-2">
							<Skeleton className="h-2.5 w-20" />
							<Skeleton className="h-6 w-28 max-w-full" />
							<Skeleton className="h-2.5 w-24" />
						</div>
					))}
				</div>
				<Skeleton className="mt-8 h-4 w-32" />
				<div className="mt-3 space-y-2.5">
					{Array.from({ length: 6 }, (_, i) => (
						<div key={i} className="flex items-center gap-4">
							<Skeleton className="h-3 w-16 shrink-0" />
							<Skeleton className="h-2 flex-1" />
							<Skeleton className="h-3 w-20 shrink-0" />
							<Skeleton className="h-3 w-20 shrink-0" />
						</div>
					))}
				</div>
				<div className="mt-8 grid gap-6 sm:grid-cols-2">
					{[0, 1].map((i) => (
						<div key={i}>
							<Skeleton className="h-4 w-32 mb-2" />
							{[0, 1, 2].map((j) => <ListRowSkeleton key={j} />)}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

/** Home page while the first requests are in flight. */
export function HomePageSkeleton() {
	return (
		<div className="px-4 sm:px-7 pt-6 sm:pt-7.5 pb-10 max-w-[1100px]" aria-busy="true" aria-label="Loading your home page">
			<Skeleton className="h-8 w-64 max-w-full mb-2.5" />
			<Skeleton className="h-4 w-80 max-w-full mb-6" />
			<div className="grid gap-3 mb-6 md:grid-cols-3">
				{[0, 1, 2].map((i) => <StatCardSkeleton key={i} />)}
			</div>
			<PanelSkeleton rows={3} />
		</div>
	);
}

/** Generic page body for route transitions (app/(app)/(shell)/loading.tsx). */
export function PageSkeleton() {
	return (
		<div className="flex-1 min-w-0 px-4 sm:px-7 pt-6 sm:pt-7.5 pb-10 max-w-[1100px]" aria-busy="true" aria-label="Loading">
			<Skeleton className="h-8 w-56 mb-2.5" />
			<Skeleton className="h-4 w-96 max-w-full mb-6" />
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				{[0, 1, 2, 3].map((i) => <StatCardSkeleton key={i} />)}
			</div>
			<div className="mt-4">
				<PanelSkeleton rows={4} />
			</div>
		</div>
	);
}
