"use client";

import Link from "next/link";
import { SheetQuickConnect } from "@/components/integrations/SheetQuickConnect";

/** Same one-step picker as the Integrations card; kept for old links and Google's return trip. */
export default function ConnectSheetPage() {
	return (
		<div className="flex-1 min-w-0 px-4 sm:px-7 pt-6 sm:pt-7.5 pb-10 max-w-[820px]">
			<Link href="/apps" className="text-[12.5px] opacity-65 underline underline-offset-2">Integrations</Link>
			<h1 className="text-[24px] sm:text-[28px] m-0 mt-2 mb-1.5">Pick your sheet</h1>
			<p className="text-sm opacity-70 m-0 mb-6">
				The one you keep your sales or costs in. OnRecord checks it every 15 minutes and never edits it.
			</p>
			<SheetQuickConnect returnTo="/apps/sheets/new" />
		</div>
	);
}
