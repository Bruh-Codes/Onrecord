export function InfoHint({ text }: { text: string }) {
	return (
		<span className="group relative inline-flex align-middle">
			<button
				type="button"
				aria-label={`About this metric: ${text}`}
				className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current/40 text-[9px] font-semibold leading-none text-foreground/50 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
			>
				i
			</button>
			<span
				role="tooltip"
				className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden w-40 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-left text-[10px] font-normal normal-case leading-snug text-background shadow-lg group-hover:block group-focus-within:block"
			>
				{text}
			</span>
		</span>
	);
}
