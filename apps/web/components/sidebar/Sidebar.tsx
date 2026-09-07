import Link from "next/link";
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
// import { RulePackPicker } from "./RulePackPicker";

export function Sidebar() {
	return (
		<div className="hidden md:flex w-[230px] h-full shrink-0 bg-panel px-3.5 py-5 flex-col border-r border-border overflow-y-auto">
			<Link href="/" className="flex items-center gap-2 px-2 pb-5">
				<span className="w-[26px] h-[26px] rounded-lg bg-ink inline-block" />
				<span className="font-[family-name:var(--font-display)] text-[15px]">
					Onrecord
				</span>
			</Link>

			<div className="flex flex-col gap-0.5">
				<NavLink href="/" icon={<HomeIcon />}>
					Home
				</NavLink>
				<NavLink href="/overview" icon={<OverviewIcon />}>
					Overview
				</NavLink>
				<NavLink href="/documents" icon={<DocumentsIcon />}>
					Documents
				</NavLink>
				<NavLink href="/counterparties" icon={<CounterpartiesIcon />}>
					Counterparties
				</NavLink>
				<NavLink href="/gaps" icon={<GapsIcon />}>
					Gaps
				</NavLink>
				<NavLink href="/apps" icon={<AppsIcon />}>
					Apps
				</NavLink>
			</div>

			{/* <RulePackPicker /> */}

			<Link
				href="/reviewer"
				className="mt-auto flex items-center gap-2.5 px-2.5 py-2.5 border-t border-border text-[13px] opacity-75 hover:opacity-100"
			>
				<ReviewerIcon />
				Reviewer queue
			</Link>
		</div>
	);
}
