"use client";

import { useRef, useState } from "react";
import { AgentDock } from "@/components/ui/agent-dock";
import { api, ApiError } from "@/lib/api";
import { useMe } from "@/lib/hooks/use-business";
import avatarSrc from "@/public/Ona.jpg";

export function AgentDockHost() {
	const { businessId } = useMe();
	const sessionId = useRef<string | undefined>(undefined);
	const [agentResponse, setAgentResponse] = useState("");
	const [responseKey, setResponseKey] = useState(0);
	const [pendingAction, setPendingAction] = useState<{ id: string; label: string } | null>(null);

	async function askOna(message: string) {
		if (!businessId) {
			setAgentResponse("Set up your business first, then I can help with your readiness.");
			setResponseKey((key) => key + 1);
			return;
		}
		try {
			const reply = await api.askOna(businessId, {
				message,
				session_id: sessionId.current,
			});
			sessionId.current = reply.session_id;
			setAgentResponse(reply.answer);
			setPendingAction(reply.proposed_action);
		} catch (error) {
			setAgentResponse(
				error instanceof ApiError
					? error.message
					: "I couldn't check your business data just now. Please try again.",
			);
		} finally {
			setResponseKey((key) => key + 1);
		}
	}

	async function confirmAction(proposalId: string) {
		if (!businessId) return;
		setPendingAction(null);
		try {
			const reply = await api.confirmOnaAction(businessId, proposalId);
			setAgentResponse(reply.answer);
		} catch (error) {
			setAgentResponse(error instanceof ApiError ? error.message : "I couldn't complete that action. Please try again.");
		} finally {
			setResponseKey((key) => key + 1);
		}
	}

	return (
		<AgentDock
			agentName="Ona"
			avatarSrc={avatarSrc}
			className="fixed inset-x-3 bottom-20 z-50 w-auto max-w-none md:inset-x-auto md:bottom-6 md:right-6 md:w-[calc(100vw-3rem)] md:max-w-md"
			idleStatus="Your assistant"
			agentResponse={agentResponse}
			agentResponseKey={responseKey}
			pendingAction={pendingAction}
			onActionConfirm={confirmAction}
			onMessageSubmit={askOna}
			workingStatus="Checking your business data..."
		/>
	);
}
