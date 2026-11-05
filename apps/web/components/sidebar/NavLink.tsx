"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLink({
	href,
	icon,
	children,
	collapsed = false,
	badge,
}: {
	href: string;
	icon: ReactNode;
	children: ReactNode;
	collapsed?: boolean;
	/** A count shown as a pill (a dot on the icon when collapsed). Hidden at 0. */
	badge?: number;
}) {
	const pathname = usePathname();
	const active = pathname === href;

	return (
		<Link
			href={href}
			aria-label={collapsed ? (badge ? `${String(children)}, ${badge} waiting` : String(children)) : undefined}
			className={`group/nav relative flex items-center rounded-[10px] text-[13.5px] ${
				collapsed
					? "mx-auto h-9 w-10 justify-center px-0"
					: "gap-2.5 px-2.5 py-2"
			} ${active ? "bg-card font-semibold shadow-[0_1px_2px_rgba(40,33,20,0.08)] ring-1 ring-border dark:bg-foreground/8 dark:shadow-none dark:ring-0" : "text-foreground/85 hover:bg-foreground/5 hover:text-foreground dark:text-foreground dark:opacity-80 dark:hover:opacity-100"}`}
		>
			<span className={`relative shrink-0 ${active ? "text-primary dark:text-current" : ""}`}>
				{icon}
				{collapsed && badge ? (
					<span aria-hidden className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full bg-warning ring-2 ring-background" />
				) : null}
			</span>
			{!collapsed && children}
			{!collapsed && badge ? (
				<span className="ml-auto min-w-5 rounded-full bg-warning px-1.5 py-px text-center text-[11px] font-semibold leading-[18px] text-white dark:text-warning-foreground">
					{badge > 99 ? "99+" : badge}
				</span>
			) : null}
			{collapsed && (
				<span className="pointer-events-none invisible absolute left-full top-1/2 z-[200] ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1.5 text-[12.5px] text-background shadow-lg group-hover/nav:visible">
					{children}
					<span className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-0 h-0 border-4 border-transparent border-r-ink" />
				</span>
			)}
		</Link>
	);
}
