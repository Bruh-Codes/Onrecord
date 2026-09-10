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
	ReviewerIcon,
} from "@/components/icons";
import { NavLink } from "./NavLink";
import icon from "@/public/icon.png";

const MAX_WIDTH = 230;
const COLLAPSED_WIDTH = 60;
const COLLAPSE_THRESHOLD = 150;

const NAV_ITEMS = [
	{ href: "/dashboard", icon: <HomeIcon />, label: "Home" },
	{ href: "/overview", icon: <OverviewIcon />, label: "Overview" },
	{ href: "/readiness", icon: <GapsIcon />, label: "Readiness" },
	{ href: "/documents", icon: <DocumentsIcon />, label: "Documents" },
	{ href: "/counterparties", icon: <CounterpartiesIcon />, label: "Counterparties" },
	{ href: "/gaps", icon: <GapsIcon />, label: "Gaps" },
	{ href: "/apps", icon: <AppsIcon />, label: "Apps" },
];

function Tooltip({ label, showClass }: { label: string; showClass: string }) {
	return (
		<span className={`pointer-events-none invisible absolute left-full top-1/2 ml-2.5 -translate-y-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-[12.5px] text-paper shadow-lg z-50 ${showClass}`}>
			{label}
		</span>
	);
}

export function Sidebar() {
	const [collapsed, setCollapsed] = useState(false);
	const [width, setWidth] = useState(MAX_WIDTH);
	const [dragging, setDragging] = useState(false);
	const drag = useRef({ startX: 0, startWidth: MAX_WIDTH, liveWidth: MAX_WIDTH });

	const effective = collapsed ? COLLAPSED_WIDTH : width;

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
		e.preventDefault();
		drag.current.startX = e.clientX;
		drag.current.startWidth = effective;
		drag.current.liveWidth = effective;
		setCollapsed(false);
		setDragging(true);
	}

	return (
		<div
			className={`group relative hidden h-full select-none md:flex ${
				dragging ? "" : "transition-[width] duration-200 ease-out"
			}`}
			style={{ width: effective }}
		>
			<aside
				className={`flex h-full w-full shrink-0 flex-col bg-panel border-r ${
					dragging ? "border-[#60a5fa]" : "border-border group-hover:border-[#60a5fa]"
				} ${collapsed ? "overflow-visible px-2.5" : "overflow-y-auto px-3.5"}`}
			>
				<Link
					href="/dashboard"
					aria-label={collapsed ? "Onrecord home" : undefined}
					className={`group/logo relative flex items-center pb-5 ${
						collapsed ? "justify-center pt-1" : "gap-2 px-2"
					}`}
				>
					<Image src={icon} alt="" width={26} height={26} />
					{!collapsed && <span className="font-display">Onrecord</span>}
					{collapsed && <Tooltip label="Onrecord home" showClass="group-hover/logo:visible" />}
				</Link>

				<div className="flex flex-col gap-0.5">
					{NAV_ITEMS.map((item) => (
						<NavLink key={item.href} href={item.href} icon={item.icon} collapsed={collapsed}>
							{item.label}
						</NavLink>
					))}
				</div>

				<Link
					href="/reviewer"
					aria-label={collapsed ? "Reviewer queue" : undefined}
					className={`group/reviewer relative mt-auto flex items-center border-t border-border text-[13px] opacity-75 hover:opacity-100 ${
						collapsed
							? "justify-center py-3"
							: "gap-2.5 px-2.5 py-2.5"
					}`}
				>
					<ReviewerIcon />
					{!collapsed && "Reviewer queue"}
					{collapsed && <Tooltip label="Reviewer queue" showClass="group-hover/reviewer:visible" />}
				</Link>
			</aside>

			<div
				role="separator"
				aria-orientation="vertical"
				onPointerDown={startDrag}
				className="absolute inset-y-0 -right-[7px] z-20 flex w-[14px] cursor-col-resize items-center justify-center"
			>
				<span
					className={`h-9 w-[3px] rounded-full transition-colors ${
						dragging ? "bg-[#60a5fa]" : "bg-ink/25 group-hover:bg-[#60a5fa]"
					}`}
				/>
			</div>
		</div>
	);
}
