export function Skeleton({ className = "" }: { className?: string }) {
	return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-panel ${className}`} />;
}

export function RowSkeleton({ className = "" }: { className?: string }) {
	return (
		<div className={`flex items-center gap-3.5 py-4 border-b border-border ${className}`}>
			<Skeleton className="w-[38px] h-[38px] rounded-[10px] shrink-0" />
			<div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-2/5" /><Skeleton className="h-3 w-3/5" /></div>
			<Skeleton className="h-7 w-20 rounded-full" />
		</div>
	);
}
