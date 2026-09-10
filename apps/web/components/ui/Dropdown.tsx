"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "@/components/icons";

export function Dropdown<T extends string | number>({
	value,
	options,
	onChange,
}: {
	value: T;
	options: { value: T; label: string; disabled?: boolean }[];
	onChange: (value: T) => void;
}) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (event: MouseEvent) => {
			if (ref.current && !ref.current.contains(event.target as Node)) {
				setOpen(false);
			}
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false);
		};
		document.addEventListener("mousedown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("mousedown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open]);

	return (
		<div ref={ref} className="relative">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				aria-haspopup="listbox"
				aria-expanded={open}
				className="flex items-center gap-3 rounded-full border border-border bg-panel px-3 py-2 text-[13px] text-ink cursor-pointer active:scale-100"
			>
				{options.find((o) => o.value === value)?.label ?? String(value)}
				<ChevronDownIcon
					className={`transition-transform ${open ? "rotate-180" : ""}`}
				/>
			</button>

			{open && (
				<div
					role="listbox"
					className="absolute top-full left-0 mt-1.5 min-w-full whitespace-nowrap rounded-xl border border-border bg-surface shadow-lg p-1 z-50 animate-slide-in"
				>
					{options.map((option) => (
						<button
							key={String(option.value)}
							type="button"
							role="option"
							aria-selected={option.value === value}
							aria-disabled={option.disabled}
							disabled={option.disabled}
							onClick={() => {
								onChange(option.value);
								setOpen(false);
							}}
							className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] ${
								option.disabled
									? "cursor-not-allowed opacity-45"
									: "cursor-pointer"
							} ${
								option.value === value
									? "bg-ink/8 font-semibold"
									: "hover:bg-panel"
							}`}
						>
							{option.label}
						</button>
					))}
				</div>
			)}
		</div>
	);
}
