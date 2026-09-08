"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLink({
	href,
	icon,
	children,
	collapsed = false,
}: {
	href: string;
	icon: ReactNode;
	children: ReactNode;
	collapsed?: boolean;
}) {
	const pathname = usePathname();
	const active = pathname === href;

	return (
		<Link
			href={href}
			aria-label={collapsed ? String(children) : undefined}
			className={`group/nav relative flex items-center rounded-[10px] text-[13.5px] ${
				collapsed
					? "mx-auto h-9 w-10 justify-center px-0"
					: "gap-2.5 px-2.5 py-2"
			} ${active ? "bg-ink/8 font-semibold" : "opacity-80 hover:opacity-100"}`}
		>
			<span className="shrink-0">{icon}</span>
			{!collapsed && children}
			{collapsed && (
				<span className="pointer-events-none invisible absolute left-full top-1/2 z-50 ml-2.5 -translate-y-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-[12.5px] text-paper shadow-lg group-hover/nav:visible">
					{children}
				</span>
			)}
		</Link>
	);
}