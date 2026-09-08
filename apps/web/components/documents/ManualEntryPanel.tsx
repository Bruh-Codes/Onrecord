"use client";

import { useState } from "react";
import { useAppActions, useAppState } from "@/lib/app-state";
import { PillButton } from "@/components/ui/PillButton";
import { Badge } from "@/components/ui/Badge";

export function ManualEntryPanel() {
	const { declaredFacts } = useAppState();
	const { addDeclaredFact } = useAppActions();
	const [open, setOpen] = useState(false);
	const [text, setText] = useState("");

	return (
		<div className="mt-3">
			<div className="flex items-center justify-between gap-4 rounded-2xl border border-border px-4 py-3 text-[12.5px]">
				<span className="opacity-65">
					Don&apos;t have a document for this yet?
				</span>
				<button
					type="button"
					onClick={() => setOpen((v) => !v)}
					className="underline bg-transparent border-none cursor-pointer text-ink font-semibold shrink-0"
				>
					{open ? "Close manual entry" : "Enter a figure instead"}
				</button>
			</div>

			{open && (
				<div className="bg-panel rounded-2xl p-4.5 mb-4">
					<div className="text-[13.5px] font-semibold mb-1">
						Tell us what you know
					</div>
					<p className="text-xs opacity-65 m-0 mb-2.5">
						e.g. &quot;Roughly GH¢3,200 of stock on hand&quot; or &quot;About
						GH¢15,000 in sales last month.&quot; This is recorded as a figure
						you stated-shown separately from verified data and never counted in
						your score.
					</p>
					<textarea
						value={text}
						onChange={(e) => setText(e.target.value)}
						placeholder="Type what you know…"
						rows={3}
						className="w-full px-3.5 py-2.5 text-[13.5px] text-ink bg-surface border border-ink/16 rounded-2xl resize-y mb-2.5"
					/>
					<PillButton
						disabled={!text.trim()}
						onClick={() => {
							addDeclaredFact(text);
							setText("");
							setOpen(false);
						}}
					>
						Save as stated figure
					</PillButton>
					<p className="text-[11.5px] opacity-55 m-0 mt-2">
						Not counted toward your score, only verifiable data is. It still feeds your financial insights.
					</p>
				</div>
			)}

			{declaredFacts.length > 0 && (
				<div className="mb-4">
					{declaredFacts.map((fact, i) => (
						<div
							key={i}
							className="flex items-start gap-2 text-[12.5px] py-2 px-1"
						>
							<Badge tone="neutral">Stated by you</Badge>
							<span className="opacity-80">{fact}</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
