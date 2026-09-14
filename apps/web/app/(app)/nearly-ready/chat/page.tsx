"use client";

import Link from "next/link";
import { BackArrowIcon } from "@/components/icons";

export default function AssistantChatPage() {
	return (
		<div className="min-h-dvh flex flex-col items-center px-4 sm:px-6 pt-9 pb-15">
			<div className="w-full max-w-[560px]">
				<Link
					href="/nearly-ready"
					className="text-[13px] inline-flex items-center gap-1 mb-4.5"
				>
					<BackArrowIcon />
					Back to checklist
				</Link>
				<h1 className="text-[22px] m-0 mb-1">Talk to Ona</h1>
				<p className="text-[13px] opacity-65 m-0 mb-6">
					Use Ona at the bottom right. She only uses verified business data.
				</p>
			</div>
		</div>
	);
}
