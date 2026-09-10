"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
	DocumentsIcon,
	GapsIcon,
	HomeIcon,
	OverviewIcon,
} from "@/components/icons";

const ITEMS = [
	{ href: "/dashboard", label: "Home", icon: HomeIcon },
	{ href: "/overview", label: "Overview", icon: OverviewIcon },
	{ href: "/readiness", label: "Readiness", icon: GapsIcon },
	{ href: "/documents", label: "Documents", icon: DocumentsIcon },
	{ href: "/gaps", label: "Gaps", icon: GapsIcon },
];

// Bottom tab bar for the owner journey on narrow viewports-Sidebar.tsx
// covers the same routes (plus Counterparties/Apps/Reviewer) on md+.
// specs/10-web.md: owner routes are mobile-first, min 44px tap targets.
export function MobileNav() {
	const pathname = usePathname();

	return (
		<nav
			className="md:hidden fixed bottom-0 inset-x-0 z-10 bg-surface border-t border-border flex items-stretch"
			style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
		>
			{ITEMS.map(({ href, label, icon: Icon }) => {
				const active = pathname === href;
				return (
					<Link
						key={href}
						href={href}
						aria-current={active ? "page" : undefined}
						className={`flex-1 min-h-[56px] flex flex-col items-center justify-center gap-1 text-[10.5px] ${
							active ? "text-ink font-semibold" : "text-ink/55"
						}`}
					>
						<Icon />
						{label}
					</Link>
				);
			})}
		</nav>
	);
}
