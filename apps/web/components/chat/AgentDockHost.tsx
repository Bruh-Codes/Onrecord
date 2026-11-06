"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AgentDock, type DockConversationMessage } from "@/components/ui/agent-dock";
import { useToast } from "@/components/ui/Toast";
import { api, ApiError } from "@/lib/api";
import type { AgentSessionSummary } from "@/lib/api-types";
import { useMe } from "@/lib/hooks/use-business";
import { useOnaFocus } from "@/lib/ona-focus";
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

// Short example questions per page, shown before the first message.
const STARTERS: { prefix: string; questions: string[] }[] = [
	{ prefix: "/readiness", questions: ["Explain my score", "What should I do first?"] },
	{ prefix: "/money", questions: ["How is my business doing?", "What will a lender look at?"] },
	{ prefix: "/documents", questions: ["What should I upload first?", "How do I get my MoMo statement?"] },
	{ prefix: "/lender-summary", questions: ["What will a lender look at?", "What is still missing?"] },
];
const DEFAULT_STARTERS = ["What should I upload first?", "How is my business doing?", "What will a lender look at?"];

export function AgentDockHost() {
	const pathname = usePathname();
	const starterQuestions =
		STARTERS.find((entry) => pathname?.startsWith(entry.prefix))?.questions ?? DEFAULT_STARTERS;
	const { businessId: ownBusinessId } = useMe();
	// On Approvals, Ona talks about the upload the reviewer has open instead.
	const focus = useOnaFocus();
	const businessId = focus?.businessId ?? ownBusinessId;
	const documentId = focus?.documentId;
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

	// Chats belong to one business: switching business (or upload) starts fresh.
	const focusKey = `${businessId ?? ""}:${documentId ?? ""}`;
	const lastFocusKey = useRef(focusKey);
	useEffect(() => {
		if (lastFocusKey.current === focusKey) return;
		lastFocusKey.current = focusKey;
		sessionId.current = undefined;
		setInitialMessages([]);
		setPendingAction(null);
		setSessionResetKey((key) => key + 1);
	}, [focusKey]);

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
				page: window.location.pathname,
				...(documentId ? { document_id: documentId } : {}),
			});
			sessionId.current = reply.session_id;
			const selectedTool = reply.used_tools.at(-1);
			if (selectedTool) {
				setWorkingActivity(
					selectedTool === "search_web" || selectedTool === "web_search" ? "searching" :
					selectedTool === "propose_action" || selectedTool === "recompute_readiness" || selectedTool === "retry_stuck_documents"
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
			idleStatus={focus ? `Reviewing ${focus.label}` : "Your assistant"}
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
			starterQuestions={focus ? [] : starterQuestions}
			workingActivity={workingActivity}
		/>
	);
}
