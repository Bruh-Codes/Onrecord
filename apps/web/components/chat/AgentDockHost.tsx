"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AgentDock, type DockConversationMessage } from "@/components/ui/agent-dock";
import { useToast } from "@/components/ui/Toast";
import { api, ApiError } from "@/lib/api";
import type { AgentSessionSummary } from "@/lib/api-types";
import { useMe } from "@/lib/hooks/use-business";
import avatarSrc from "@/public/Ona.jpg";

function toConversationMessages(
	messages: { role: string; content: string }[],
): DockConversationMessage[] {
	let id = 0;
	return messages.map((message) => ({
		id: ++id,
		role: message.role === "owner" ? "user" : "agent",
		text: message.content,
	}));
}

export function AgentDockHost() {
	const { businessId } = useMe();
	const { toast } = useToast();
	const sessionId = useRef<string | undefined>(undefined);
	const [agentResponse, setAgentResponse] = useState("");
	const [responseKey, setResponseKey] = useState(0);
	const [pendingAction, setPendingAction] = useState<{ id: string; label: string } | null>(null);
	const [chatSessions, setChatSessions] = useState<AgentSessionSummary[]>([]);
	const [sessionResetKey, setSessionResetKey] = useState(0);
	const [initialMessages, setInitialMessages] = useState<DockConversationMessage[]>([]);
	const [workingActivity, setWorkingActivity] = useState<
		"thinking" | "searching" | "checking_data" | "running_action"
	>("checking_data");

	const refreshSessions = useCallback(async () => {
		if (!businessId) {
			setChatSessions([]);
			return;
		}
		try {
			const data = await api.listOnaSessions(businessId);
			setChatSessions(data.items);
		} catch {
			setChatSessions([]);
		}
	}, [businessId]);

	useEffect(() => {
		void refreshSessions();
	}, [refreshSessions]);

	async function askOna(message: string) {
		setWorkingActivity("thinking");
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
			const selectedTool = reply.used_tools.at(-1);
			if (selectedTool) {
				setWorkingActivity(
					selectedTool === "search_web" ? "searching" :
					selectedTool === "recompute_readiness" || selectedTool === "retry_stuck_documents"
						? "running_action"
						: "checking_data",
				);
				await new Promise((resolve) => window.setTimeout(resolve, 350));
			}
			setAgentResponse(reply.answer);
			setPendingAction(reply.proposed_action);
			void refreshSessions();
		} catch (error) {
			setAgentResponse(
				error instanceof ApiError
					? error.message
					: "I couldn't check your business data just now. Please try again.",
			);
			toast({
				title: "Ona couldn't respond",
				description: error instanceof ApiError ? error.message : "Please try again.",
				tone: "error",
			});
		} finally {
			setResponseKey((key) => key + 1);
		}
	}

	async function confirmAction(proposalId: string) {
		if (!businessId) return;
		setWorkingActivity("running_action");
		setPendingAction(null);
		try {
			const reply = await api.confirmOnaAction(businessId, proposalId);
			setAgentResponse(reply.answer);
		} catch (error) {
			setAgentResponse(
				error instanceof ApiError
					? error.message
					: "I couldn't complete that action. Please try again.",
			);
			toast({
				title: "Action failed",
				description: error instanceof ApiError ? error.message : "Please try again.",
				tone: "error",
			});
		} finally {
			setResponseKey((key) => key + 1);
		}
	}

	async function selectSession(nextSessionId: string) {
		if (!businessId) return;
		const detail = await api.getOnaSession(businessId, nextSessionId);
		sessionId.current = detail.id;
		setInitialMessages(toConversationMessages(detail.messages));
		setPendingAction(null);
		setSessionResetKey((key) => key + 1);
	}

	async function deleteSession(nextSessionId: string) {
		if (!businessId) return;
		await api.deleteOnaSession(businessId, nextSessionId);
		if (sessionId.current === nextSessionId) {
			sessionId.current = undefined;
			setInitialMessages([]);
			setPendingAction(null);
			setSessionResetKey((key) => key + 1);
		}
		await refreshSessions();
	}

	function startNewChat() {
		sessionId.current = undefined;
		setInitialMessages([]);
		setPendingAction(null);
		setSessionResetKey((key) => key + 1);
	}

	return (
		<AgentDock
			activeSessionId={sessionId.current}
			agentName="Ona"
			avatarSrc={avatarSrc}
			chatSessions={chatSessions}
			className="fixed inset-x-3 bottom-20 z-50 w-auto max-w-none md:inset-x-auto md:bottom-6 md:right-6 md:w-[calc(100vw-3rem)] md:max-w-md"
			idleStatus="Your assistant"
			agentResponse={agentResponse}
			agentResponseKey={responseKey}
			initialMessages={initialMessages}
			onDeleteSession={deleteSession}
			onMessageSubmit={askOna}
			onNewChat={startNewChat}
			onRefreshSessions={refreshSessions}
			onSelectSession={selectSession}
			onActionConfirm={confirmAction}
			pendingAction={pendingAction}
			sessionResetKey={sessionResetKey}
			workingActivity={workingActivity}
		/>
	);
}
