export function InfoHint({ text }: { text: string }) {
	return (
		<span className="group relative inline-flex align-middle">
			<button
				type="button"
				aria-label={`About this metric: ${text}`}
				className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-current/40 text-[10px] font-semibold leading-none text-ink/50 transition-colors hover:text-ink focus-visible:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
			>
				i
			</button>
			<span
				role="tooltip"
				className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-56 -translate-x-1/2 rounded-lg bg-ink px-3 py-2 text-left text-[11px] font-normal leading-relaxed text-paper shadow-lg group-hover:block group-focus-within:block"
			>
				{text}
			</span>
		</span>
	);
}
