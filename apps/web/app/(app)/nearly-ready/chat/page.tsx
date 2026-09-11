"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChatBubble } from "@/components/chat/ChatBubble";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { BackArrowIcon } from "@/components/icons";
import { ThinkingOrb } from "@/components/ui/thinking-orbs";
import { ToolGroup, type NestedTool } from "@/components/ui/tool-group";
import { useAppActions, useAppState } from "@/lib/app-state";
import { CHAT_SCRIPT } from "@/lib/mock-data";

type AgentActivity = "idle" | "searching" | "thinking";

const simulatedTools: NestedTool[] = [
	{ category: "file", title: "Read", subtitle: "app/(app)/nearly-ready/chat/page.tsx" },
	{ category: "search", title: "Grep", subtitle: "chatLog" },
	{ category: "file", title: "Read", subtitle: "components/chat/ChatComposer.tsx" },
	{ category: "search", title: "Grep", subtitle: "resolved" },
	{ category: "file", title: "Read", subtitle: "lib/app-state.tsx" },
	{ category: "search", title: "Glob", subtitle: "components/**/*.tsx" },
];

export default function AssistantChatPage() {
	const { chatLog, chatIndex } = useAppState();
	const { startChat } = useAppActions();
	const [activity, setActivity] = useState<AgentActivity>("idle");
	const activityTimers = useRef<number[]>([]);

	useEffect(() => {
		startChat();
	}, [startChat]);

	useEffect(() => {
		return () => {
			for (const timer of activityTimers.current) {
				window.clearTimeout(timer);
			}
		};
	}, []);

	const simulateAgentReply = useCallback((reply: () => void) => {
		for (const timer of activityTimers.current) {
			window.clearTimeout(timer);
		}

		setActivity("searching");
		const thinkingTimer = window.setTimeout(() => {
			setActivity("thinking");
		}, 1800);
		const replyTimer = window.setTimeout(() => {
			reply();
			setActivity("idle");
		}, 3200);
		activityTimers.current = [thinkingTimer, replyTimer];
	}, []);

	const hasOpenQuestion = chatIndex < CHAT_SCRIPT.length;
	const chatDone = !hasOpenQuestion && chatLog.length > 0;

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
				<h1 className="text-[22px] m-0 mb-1">Talk to your assistant</h1>
				<p className="text-[13px] opacity-65 m-0 mb-6">
					One question at a time-you can stop anytime.
				</p>

				<div className="flex flex-col gap-2.5 mb-4">
					{chatLog.map((msg, i) => (
						<ChatBubble key={i} message={msg} />
					))}
					{activity === "searching" && (
						<div className="max-w-[94%] self-start rounded-2xl bg-foreground/[0.04] px-4 py-3">
							<ToolGroup
								state="pending"
								nestedTools={simulatedTools}
								completeLabel="Explored"
								shimmerLabel="Exploring"
								interruptedLabel="Exploration interrupted"
								maxVisibleTools={5}
								defaultOpen
							/>
						</div>
					)}
					{activity === "thinking" && (
						<div className="flex items-center gap-3 self-start rounded-2xl bg-muted px-3 py-2 text-sm text-muted-foreground">
							<ThinkingOrb state="working" size={20} theme="light" />
							<span>Thinking...</span>
						</div>
					)}
				</div>

				{hasOpenQuestion && (
					<ChatComposer
						chatIndex={chatIndex}
						disabled={activity !== "idle"}
						onReplyStart={(reply) => simulateAgentReply(reply)}
					/>
				)}

				{chatDone && (
					<Link
						href="/nearly-ready"
						className="w-full mt-2 block text-center bg-foreground text-background font-display text-sm py-3.5 rounded-full"
					>
						Back to checklist
					</Link>
				)}
			</div>
		</div>
	);
}
