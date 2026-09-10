"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
	AppsIcon,
	CounterpartiesIcon,
	DocumentsIcon,
	GapsIcon,
	HomeIcon,
	OverviewIcon,
	ReadinessIcon,
} from "@/components/icons";
import { NavLink } from "./NavLink";
import icon from "@/public/icon.png";

const MAX_WIDTH = 230;
const COLLAPSED_WIDTH = 60;
const COLLAPSE_THRESHOLD = 150;

const NAV_GROUPS = [
	{
		label: "Workspace",
		items: [
			{ href: "/dashboard", icon: <HomeIcon />, label: "Home" },
			{ href: "/overview", icon: <OverviewIcon />, label: "Overview" },
			{ href: "/readiness", icon: <ReadinessIcon />, label: "Readiness" },
			{ href: "/documents", icon: <DocumentsIcon />, label: "Documents" },
		],
	},
	{
		label: "Manage",
		items: [
			{ href: "/counterparties", icon: <CounterpartiesIcon />, label: "Counterparties" },
			{ href: "/gaps", icon: <GapsIcon />, label: "Gaps" },
			{ href: "/apps", icon: <AppsIcon />, label: "Integrations" },
		],
	},
];

function Tooltip({ label, showClass }: { label: string; showClass: string }) {
	return (
		<span className={`pointer-events-none invisible absolute left-full top-1/2 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-[12.5px] text-paper shadow-lg z-[200] ${showClass}`}>
			{label}
			<span className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-0 h-0 border-4 border-transparent border-r-ink" />
		</span>
	);
}

export function Sidebar() {
	const [collapsed, setCollapsed] = useState(() => {
		if (typeof window !== "undefined") {
			const saved = localStorage.getItem("sidebar-collapsed");
			if (saved !== null) return JSON.parse(saved);
		}
		return true;
	});
	const [width, setWidth] = useState(MAX_WIDTH);
	const [dragging, setDragging] = useState(false);
	const drag = useRef({ startX: 0, startWidth: MAX_WIDTH, liveWidth: MAX_WIDTH });

	const effective = collapsed ? COLLAPSED_WIDTH : width;

	useEffect(() => {
		localStorage.setItem("sidebar-collapsed", JSON.stringify(collapsed));
	}, [collapsed]);

	useEffect(() => {
		if (!dragging) return;

		const onMove = (e: PointerEvent) => {
			const delta = e.clientX - drag.current.startX;
			const next = Math.min(
				MAX_WIDTH,
				Math.max(COLLAPSED_WIDTH, drag.current.startWidth + delta),
			);
			drag.current.liveWidth = next;
			setWidth(next);
		};

		const onUp = () => {
			setDragging(false);
			setCollapsed(drag.current.liveWidth < COLLAPSE_THRESHOLD);
		};

		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
		return () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
		};
	}, [dragging]);

	function startDrag(e: React.PointerEvent) {
		if (collapsed) return;
		e.preventDefault();
		drag.current.startX = e.clientX;
		drag.current.startWidth = effective;
		drag.current.liveWidth = effective;
		setDragging(true);
	}

	function toggleCollapsed() {
		setCollapsed((c: boolean) => !c);
	}

	const liveCollapsed = dragging ? width < COLLAPSE_THRESHOLD : collapsed;

	return (
		<div
			className={`group relative hidden h-full select-none md:flex ${
				dragging ? "" : "transition-[width] duration-200 ease-out"
			}`}
			style={{ width: effective }}
		>
			<aside
				className={`flex h-full w-full shrink-0 flex-col bg-panel border-r ${
					dragging ? "border-[#60a5fa]" : "border-border"
				} ${liveCollapsed ? "overflow-visible px-2.5" : "overflow-y-auto px-3.5"}`}
			>
				<Link
					href="/"
					aria-label={liveCollapsed ? "Onrecord home" : undefined}
					className={`group/logo relative flex items-center py-5 opacity-100 hover:opacity-100 ${
						liveCollapsed ? "justify-center" : "gap-2 px-2"
					}`}
				>
					<Image src={icon} alt="" width={26} height={26} />
					{!liveCollapsed && <span className="font-display">Onrecord</span>}
					{liveCollapsed && <Tooltip label="Onrecord home" showClass="group-hover/logo:visible" />}
				</Link>

				<div className="flex flex-col">
					{NAV_GROUPS.map((group, groupIndex) => (
						<div key={group.label} className={groupIndex > 0 ? "mt-3 border-t border-border pt-3" : undefined}>
							{!liveCollapsed && (
								<div className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/40">
									{group.label}
								</div>
							)}
							<div className="flex flex-col gap-0.5">
								{group.items.map((item) => (
									<NavLink key={item.href} href={item.href} icon={item.icon} collapsed={liveCollapsed}>
										{item.label}
									</NavLink>
								))}
							</div>
						</div>
					))}
				</div>
			</aside>

			<div
				role="separator"
				aria-orientation="vertical"
				onPointerDown={startDrag}
				onDoubleClick={toggleCollapsed}
				className="group/resize absolute inset-y-0 -right-[7px] z-20 flex w-[14px] cursor-col-resize items-center justify-center"
			>
				<span
					className={`h-9 w-[3px] rounded-full transition-colors ${
						dragging ? "bg-[#60a5fa]" : "bg-ink/25 group-hover/resize:bg-[#60a5fa]"
					}`}
				/>
			</div>
		</div>
	);
}
