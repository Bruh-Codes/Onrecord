"use client";

import { AgentDock } from "@/components/ui/agent-dock";
import { useAppActions, useAppState } from "@/lib/app-state";
import avatarSrc from "@/public/Ona.jpg";

export function AgentDockHost() {
	const { submitCustomChatReply } = useAppActions();
	const { chatLog } = useAppState();
	const agentResponse = [...chatLog]
		.reverse()
		.find((message) => message.fromAgent)?.text;

	return (
		<AgentDock
			agentName="Ona"
			avatarSrc={avatarSrc}
			className="fixed inset-x-3 bottom-20 z-50 w-auto max-w-none md:inset-x-auto md:bottom-6 md:right-6 md:w-[calc(100vw-3rem)] md:max-w-md"
			idleStatus="Your assistant"
			agentResponse={agentResponse}
			agentResponseKey={chatLog.length}
			onMessageSubmit={submitCustomChatReply}
			workingStatus="Updating your readiness..."
		/>
	);
}
