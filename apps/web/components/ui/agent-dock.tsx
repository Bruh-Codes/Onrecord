"use client";

import {
	CaretDownIcon,
	ChatIcon,
	ClockCounterClockwiseIcon,
	MicrophoneIcon,
	PaperPlaneTiltIcon,
	TrashIcon,
	XIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image, { StaticImageData } from "next/image";
import { LiveWaveform } from "@/components/ui/live-waveform";
import { ThinkingOrb } from "@/components/ui/thinking-orbs";
import { ToolGroup } from "@/components/ui/tool-group";
import {
	activityStatusLabel,
	detectOnaActivity,
	type OnaActivity,
} from "@/lib/ona-activity";
import { useTheme } from "next-themes";
import {
	type FormEvent,
	type KeyboardEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

type AgentDockMode = "idle" | "composing" | "working";

export type DockConversationMessage = {
	id: number;
	role: "user" | "agent";
	text: string;
	activity?: OnaActivity;
};

type ChatSessionSummary = {
	id: string;
	opened_at: string;
	preview: string;
	message_count: number;
};

type AgentDockProps = {
	agentName: string;
	avatarSrc: StaticImageData | string;
	className?: string;
	idleStatus?: string;
	workingActivity?: OnaActivity;
	agentResponse?: string;
	agentResponseKey?: number;
	onMessageSubmit?: (message: string) => void | Promise<void>;
	pendingAction?: { id: string; label: string } | null;
	onActionConfirm?: (proposalId: string) => void | Promise<void>;
	chatSessions?: ChatSessionSummary[];
	activeSessionId?: string;
	onSelectSession?: (sessionId: string) => void | Promise<void>;
	onDeleteSession?: (sessionId: string) => void | Promise<void>;
	onNewChat?: () => void;
	onRefreshSessions?: () => void | Promise<void>;
	initialMessages?: DockConversationMessage[];
	sessionResetKey?: number;
};

const dockTransition = {
	duration: 0.3,
	ease: [0.22, 1, 0.36, 1],
} as const;

const dockLayoutTransition = {
	damping: 32,
	mass: 0.8,
	stiffness: 380,
	type: "spring",
} as const;

const idleCollapseDelay = 8000;

export function AgentDock({
	agentName,
	avatarSrc,
	className,
	idleStatus = "Ready",
	workingActivity = "checking_data",
	agentResponse,
	agentResponseKey,
	onMessageSubmit,
	pendingAction = null,
	onActionConfirm,
	chatSessions = [],
	activeSessionId,
	onSelectSession,
	onDeleteSession,
	onNewChat,
	onRefreshSessions,
	initialMessages = [],
	sessionResetKey = 0,
}: AgentDockProps) {
	const [mode, setMode] = useState<AgentDockMode>("idle");
	const [isExpanded, setIsExpanded] = useState(false);
	const [hasStartedChat, setHasStartedChat] = useState(false);
	const [isVoiceActive, setIsVoiceActive] = useState(false);
	const [isTranscribing, setIsTranscribing] = useState(false);
	const [conversation, setConversation] = useState<DockConversationMessage[]>(
		[],
	);
	const [message, setMessage] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const conversationScrollRef = useRef<HTMLDivElement>(null);
	const conversationContentRef = useRef<HTMLDivElement>(null);
	const shouldStickToBottom = useRef(true);
	const forceScrollToBottom = useRef(false);
	const lastAgentResponseKey = useRef(agentResponseKey ?? 0);
	const conversationId = useRef(0);
	const activeAgentMessageId = useRef<number | null>(null);
	const shouldReduceMotion = useReducedMotion();
	const { resolvedTheme } = useTheme();
	const theme = resolvedTheme === "dark" ? "dark" : "light";
	const waveformColor = theme === "dark" ? "#C0C0C0" : "#555555";
	const [isMobileViewport, setIsMobileViewport] = useState(false);
	const [isHistoryOpen, setIsHistoryOpen] = useState(false);
	const [currentActivity, setCurrentActivity] = useState<OnaActivity>("thinking");
	const historyPanelRef = useRef<HTMLDivElement>(null);
	const handleVoiceError = useCallback(() => {
		setIsVoiceActive(false);
		setIsTranscribing(false);
	}, []);

	useEffect(() => {
		if (sessionResetKey === 0 && initialMessages.length === 0) return;
		setConversation(initialMessages);
		setHasStartedChat(initialMessages.length > 0);
		conversationId.current = initialMessages.length;
		activeAgentMessageId.current = null;
		setMode(initialMessages.length > 0 ? "composing" : "idle");
		setIsHistoryOpen(false);
	}, [sessionResetKey, initialMessages]);

	useEffect(() => {
		if (!isHistoryOpen) return;
		function handlePointerDown(event: MouseEvent) {
			if (!historyPanelRef.current?.contains(event.target as Node)) {
				setIsHistoryOpen(false);
			}
		}
		document.addEventListener("mousedown", handlePointerDown);
		return () => document.removeEventListener("mousedown", handlePointerDown);
	}, [isHistoryOpen]);

	useEffect(() => {
		const mediaQuery = window.matchMedia("(max-width: 767px)");
		const updateViewport = () => setIsMobileViewport(mediaQuery.matches);

		updateViewport();
		mediaQuery.addEventListener("change", updateViewport);
		return () => mediaQuery.removeEventListener("change", updateViewport);
	}, []);

	useEffect(() => {
		if (!isExpanded || mode !== "idle" || isVoiceActive || isTranscribing) {
			return;
		}

		const collapseTimer = window.setTimeout(() => {
			setIsExpanded(false);
		}, idleCollapseDelay);

		return () => window.clearTimeout(collapseTimer);
	}, [isExpanded, isTranscribing, isVoiceActive, mode]);

	function scrollConversationToBottom(behavior: ScrollBehavior = "auto") {
		const scrollContainer = conversationScrollRef.current;
		if (!scrollContainer) return;

		scrollContainer.scrollTo({
			top: scrollContainer.scrollHeight,
			behavior,
		});
	}

	function handleConversationScroll() {
		const scrollContainer = conversationScrollRef.current;
		if (!scrollContainer) return;

		const distanceFromBottom =
			scrollContainer.scrollHeight -
			scrollContainer.scrollTop -
			scrollContainer.clientHeight;
		shouldStickToBottom.current = distanceFromBottom <= 24;
	}

	useEffect(() => {
		if (!hasStartedChat) return;

		const shouldScroll =
			forceScrollToBottom.current || shouldStickToBottom.current;
		const behavior = forceScrollToBottom.current ? "smooth" : "auto";
		forceScrollToBottom.current = false;
		if (!shouldScroll) return;

		const frame = window.requestAnimationFrame(() =>
			scrollConversationToBottom(behavior),
		);
		return () => window.cancelAnimationFrame(frame);
	}, [conversation, hasStartedChat]);

	useEffect(() => {
		const content = conversationContentRef.current;
		if (!content || typeof ResizeObserver === "undefined") return;

		const observer = new ResizeObserver(() => {
			if (!shouldStickToBottom.current && !forceScrollToBottom.current) return;
			scrollConversationToBottom();
		});
		observer.observe(content);
		return () => observer.disconnect();
	}, [hasStartedChat]);

	useEffect(() => {
		if (!isExpanded) {
			delete document.documentElement.dataset.agentDockOpen;
			return;
		}

		document.documentElement.dataset.agentDockOpen = "true";
		return () => {
			delete document.documentElement.dataset.agentDockOpen;
		};
	}, [isExpanded]);

	useEffect(() => {
		if (
			!hasStartedChat ||
			agentResponseKey === undefined ||
			!agentResponse ||
			agentResponseKey <= lastAgentResponseKey.current
		) {
			return;
		}

		lastAgentResponseKey.current = agentResponseKey;
		const activeMessageId = activeAgentMessageId.current;
		if (activeMessageId !== null) {
			activeAgentMessageId.current = null;
			setConversation((current) =>
				current.map((entry) =>
					entry.id === activeMessageId
						? { ...entry, activity: undefined, text: agentResponse }
						: entry,
				),
			);
			return;
		}

		setConversation((current) => [
			...current,
			{ id: ++conversationId.current, role: "agent", text: agentResponse },
		]);
	}, [agentResponse, agentResponseKey, hasStartedChat]);

	function openComposer() {
		setIsExpanded(true);
		setMode("composing");
		window.requestAnimationFrame(() => textareaRef.current?.focus());
	}

	function collapseDock() {
		setMode("idle");
		setIsVoiceActive(false);
		setIsTranscribing(false);
		setIsExpanded(false);
	}

	function startVoice() {
		setMessage("");
		setMode("idle");
		setIsTranscribing(false);
		setIsVoiceActive(true);
	}

	function stopVoice() {
		setIsVoiceActive(false);
		setIsTranscribing(true);
		setIsExpanded(true);
		setMode("composing");
		window.requestAnimationFrame(() => textareaRef.current?.focus());
	}

	async function submitMessage() {
		const nextMessage = message.trim();
		if (!nextMessage) {
			openComposer();
			return;
		}

		setMessage("");
		setIsTranscribing(false);
		setHasStartedChat(true);
		shouldStickToBottom.current = true;
		forceScrollToBottom.current = true;
		const activity = detectOnaActivity(nextMessage);
		setCurrentActivity(activity);
		const agentMessageId = ++conversationId.current;
		activeAgentMessageId.current = agentMessageId;
		setConversation((current) => [
			...current,
			{ id: ++conversationId.current, role: "user", text: nextMessage },
			{ id: agentMessageId, role: "agent", text: "", activity },
		]);
		setIsExpanded(true);
		setMode("working");
		await onMessageSubmit?.(nextMessage);
		setMode("composing");
		window.requestAnimationFrame(() => textareaRef.current?.focus());
	}

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (mode === "composing") {
			void submitMessage();
			return;
		}
		openComposer();
	}

	function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
		if (event.key !== "Enter" || event.shiftKey) {
			return;
		}
		event.preventDefault();
		void submitMessage();
	}

	return (
		<form
			className={className}
			onSubmit={handleSubmit}
			style={{ maxWidth: isExpanded && hasStartedChat ? 560 : undefined }}
		>
			<motion.div
				animate={{ scale: 1, y: 0 }}
				className={
					isExpanded
						? `flex max-h-[calc(100dvh-5rem)] w-full ${hasStartedChat ? "flex-col" : "flex-col-reverse"} overflow-hidden rounded-2xl bg-card p-2 text-card-foreground shadow-card`
						: "ml-auto flex w-fit flex-col items-center gap-1.5 rounded-2xl bg-card px-2.5 py-2.5 text-card-foreground shadow-card"
				}
				initial={false}
				layout
				style={{ transformOrigin: "bottom right" }}
				transition={shouldReduceMotion ? { duration: 0 } : dockLayoutTransition}
			>
				{!isExpanded ? (
					<button
						aria-label={`Open ${agentName} assistant`}
						className="flex flex-col items-center gap-1.5 text-card-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						onClick={() => {
							setIsExpanded(true);
							openComposer();
						}}
						type="button"
					>
						<motion.div
							className="size-14 overflow-hidden rounded-xl"
							layoutId="agent-avatar"
							transition={
								shouldReduceMotion ? { duration: 0 } : dockLayoutTransition
							}
						>
							<Image
								alt="Ona"
								aria-hidden="true"
								className="size-full object-cover"
								height={56}
								src={avatarSrc}
								width={56}
							/>
						</motion.div>
						<motion.span
							className="px-1 text-xs font-semibold leading-none"
							layoutId="agent-name"
							transition={
								shouldReduceMotion ? { duration: 0 } : dockLayoutTransition
							}
						>
							{agentName}
						</motion.span>
					</button>
				) : (
					<>
						{isVoiceActive || isTranscribing ? (
							<div className="flex items-center gap-3">
								<motion.div
									className="size-9 shrink-0 overflow-hidden rounded-xl"
									layoutId="agent-avatar"
									transition={
										shouldReduceMotion ? { duration: 0 } : dockLayoutTransition
									}
								>
									<Image
										alt=""
										aria-hidden="true"
										className="size-full object-cover"
										height={36}
										src={avatarSrc}
										width={36}
									/>
								</motion.div>
								{isTranscribing ? (
									<span
										aria-live="polite"
										className="min-w-0 flex-1 text-sm text-muted-foreground"
									>
										Transcribing...
									</span>
								) : (
									<LiveWaveform
										active
										barColor={waveformColor}
										barGap={2}
										barHeight={2}
										barWidth={3}
										className="min-w-0 flex-1"
										fadeEdges={false}
										height={32}
										onError={handleVoiceError}
									/>
								)}
								{isVoiceActive && (
									<div className="flex shrink-0 items-center gap-1.5">
										<DockButton
											icon={<XIcon weight="bold" />}
											label="Stop"
											onClick={stopVoice}
											shortcut="V"
										/>
										<DockButton
											icon={<PaperPlaneTiltIcon weight="fill" />}
											label="Send"
											onClick={stopVoice}
											shortcut="C"
										/>
									</div>
								)}
							</div>
						) : (
							<div className="flex items-center gap-3">
								<motion.div
									className="size-9 shrink-0 overflow-hidden rounded-xl"
									layoutId="agent-avatar"
									transition={
										shouldReduceMotion ? { duration: 0 } : dockLayoutTransition
									}
								>
									<Image
										alt=""
										aria-hidden="true"
										className="size-full object-cover"
										height={36}
										src={avatarSrc}
										width={36}
									/>
								</motion.div>
								<div className="min-w-0 flex-1">
									<motion.span
										className="block truncate text-xs font-semibold leading-none"
										layoutId="agent-name"
										transition={
											shouldReduceMotion
												? { duration: 0 }
												: dockLayoutTransition
										}
									>
										{agentName}
									</motion.span>
									<AnimatePresence initial={false} mode="popLayout">
										<motion.p
											animate={{ opacity: 1, y: 0 }}
											className="mt-1 truncate text-xs text-muted-foreground"
											exit={{ opacity: 0, y: -6 }}
											initial={{ opacity: 0, y: 6 }}
											key={mode}
											transition={{ duration: 0.16, ease: "easeOut" }}
										>
											{mode === "working"
												? activityStatusLabel(workingActivity ?? currentActivity)
												: idleStatus}
										</motion.p>
									</AnimatePresence>
								</div>
								<div className="flex shrink-0 items-center gap-1.5">
									<div className="relative" ref={historyPanelRef}>
												<button
													aria-expanded={isHistoryOpen}
													aria-label="Chat history"
													className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
													onClick={() => {
														setIsHistoryOpen((open) => {
															const next = !open;
															if (next) void onRefreshSessions?.();
															return next;
														});
													}}
													type="button"
												>
													<ClockCounterClockwiseIcon className="size-4" weight="bold" />
												</button>
												{isHistoryOpen && (
													<div className="absolute right-0 top-full z-20 mt-1.5 w-72 overflow-hidden rounded-xl border border-foreground/10 bg-card shadow-card">
														<div className="flex items-center justify-between border-b border-foreground/10 px-3 py-2">
															<span className="text-xs font-semibold">Chat history</span>
															<button
																className="text-xs font-medium text-muted-foreground hover:text-foreground"
																onClick={() => {
																	onNewChat?.();
																	setIsHistoryOpen(false);
																}}
																type="button"
															>
																New chat
															</button>
														</div>
														<div className="max-h-64 overflow-y-auto p-1">
															{chatSessions.length === 0 ? (
																<p className="px-2 py-3 text-xs text-muted-foreground">
																	No saved chats yet.
																</p>
															) : (
																chatSessions.map((entry) => (
																	<div
																		className={`group flex items-start gap-2 rounded-lg px-2 py-2 hover:bg-muted ${
																			entry.id === activeSessionId ? "bg-muted" : ""
																		}`}
																		key={entry.id}
																	>
																		<button
																			className="min-w-0 flex-1 text-left"
																			onClick={() => {
																				void onSelectSession?.(entry.id);
																				setIsHistoryOpen(false);
																			}}
																			type="button"
																		>
																			<span className="block truncate text-sm">
																				{entry.preview}
																			</span>
																			<span className="mt-0.5 block text-[11px] text-muted-foreground">
																				{new Date(entry.opened_at).toLocaleString(undefined, {
																					dateStyle: "medium",
																					timeStyle: "short",
																				})}
																				{" · "}
																				{entry.message_count} messages
																			</span>
																		</button>
																		<button
																			aria-label={`Delete chat: ${entry.preview}`}
																			className="mt-0.5 shrink-0 rounded-md p-1 text-muted-foreground opacity-0 hover:bg-background hover:text-foreground group-hover:opacity-100"
																			onClick={(event) => {
																				event.stopPropagation();
																				void onDeleteSession?.(entry.id);
																			}}
																			type="button"
																		>
																			<TrashIcon className="size-3.5" weight="bold" />
																		</button>
																	</div>
																))
															)}
														</div>
													</div>
												)}
									</div>
									{(hasStartedChat || mode === "idle") && (
										<button
											aria-label="Collapse assistant"
											className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
											onClick={collapseDock}
											type="button"
										>
											<CaretDownIcon className="size-4" weight="bold" />
										</button>
									)}
									{mode === "idle" && !hasStartedChat && (
										<>
											<DockButton
												icon={<MicrophoneIcon weight="bold" />}
												label="Voice"
												onClick={startVoice}
												shortcut="V"
											/>
											<DockButton
												icon={<ChatIcon weight="bold" />}
												label="Chat"
												shortcut="C"
												type="submit"
											/>
										</>
									)}
									{mode === "composing" && !hasStartedChat && (
										<>
											<DockButton
												icon={<MicrophoneIcon weight="bold" />}
												label="Voice"
												onClick={startVoice}
											/>
											<DockButton
												icon={<PaperPlaneTiltIcon weight="fill" />}
												label="Send"
												type="submit"
											/>
										</>
									)}
								</div>
							</div>
						)}
						<motion.div
							animate={{
								height:
									mode === "working"
										? isMobileViewport
											? 400
											: 500
										: mode === "composing" && hasStartedChat
											? isMobileViewport
												? 400
												: 500
											: mode === "composing"
												? 190
												: 0,
								opacity: mode === "composing" || mode === "working" ? 1 : 0,
							}}
							aria-hidden={mode !== "composing" && mode !== "working"}
							className="min-h-0 overflow-hidden"
							initial={false}
							transition={shouldReduceMotion ? { duration: 0 } : dockTransition}
						>
							{hasStartedChat ? (
								<div className="flex h-full min-h-0 flex-col gap-2 px-2 py-0">
									<div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
										<div className="relative min-h-0 flex-1 overflow-hidden">
											<div
												className="relative z-0 h-full overflow-y-auto overscroll-contain px-2 py-1 text-sm leading-6 text-neutral-300 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-track]:bg-transparent"
												onScroll={handleConversationScroll}
												ref={conversationScrollRef}
												style={{
													WebkitMaskImage:
														"linear-gradient(to bottom, transparent 0, black 28px, black calc(100% - 32px), transparent 100%)",
													maskImage:
														"linear-gradient(to bottom, transparent 0, black 28px, black calc(100% - 32px), transparent 100%)",
												}}
											>
												<div
													className="flex flex-col gap-2 pb-8 pt-7"
													ref={conversationContentRef}
												>
											{conversation.map((entry, index) => (
														<div key={`${entry.role}-${entry.id ?? index}`}>
															{entry.activity ? (
																<ActivityIndicator activity={entry.activity} theme={theme} />
															) : (
																<div
																	className={
																		entry.role === "user"
																			? "w-full rounded-xl bg-[#e2e2e0] px-3 py-2 text-foreground dark:bg-[#2a2a28]"
																			: "w-full rounded-xl bg-[#f8f8f6] px-3 py-2 text-foreground dark:bg-[#3a3a36]"
																	}
																>
																	{entry.text}
																</div>
															)}
														</div>
											))}
											{pendingAction && (
												<button
													className="w-full rounded-xl bg-foreground px-3 py-2 text-sm font-medium text-background"
													onClick={() => void onActionConfirm?.(pendingAction.id)}
													type="button"
												>
													{pendingAction.label}
												</button>
											)}
												</div>
											</div>
										</div>
									</div>
									<div className="flex shrink-0 flex-col gap-0">
										<div className="relative w-full">
											<textarea
												aria-label="Message agent"
												className="h-16 min-h-16 w-full resize-none bg-transparent px-2 py-2 text-sm leading-6 text-card-foreground outline-none placeholder:text-muted-foreground"
												disabled={mode === "working"}
												onChange={(event) => setMessage(event.target.value)}
												onKeyDown={handleTextareaKeyDown}
												placeholder={
													mode === "working"
														? "Thinking..."
														: isTranscribing
															? "Transcribing..."
															: "Type something here..."
												}
												ref={textareaRef}
												value={message}
											/>
										</div>
										<div className="flex items-center justify-end gap-1.5">
											<DockButton
												disabled={mode === "working"}
												icon={<MicrophoneIcon weight="bold" />}
												label="Voice"
												onClick={startVoice}
												shortcut="V"
											/>
											<DockButton
												disabled={mode === "working"}
												icon={<PaperPlaneTiltIcon weight="fill" />}
												label="Send"
												shortcut="C"
												type="submit"
											/>
										</div>
									</div>
								</div>
							) : (
								<div className="flex items-end gap-2">
									<div className="relative min-w-0 flex-1">
										<button
											aria-label="Close composer"
											className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
											onClick={() => {
												setIsTranscribing(false);
												setMode("idle");
											}}
											type="button"
										>
											<XIcon className="size-3.5" weight="bold" />
										</button>
										<textarea
											aria-label="Message agent"
											className="h-28 w-full resize-none bg-transparent px-2 py-2 pr-9 text-sm leading-6 text-card-foreground outline-none placeholder:text-muted-foreground"
											onChange={(event) => setMessage(event.target.value)}
											onKeyDown={handleTextareaKeyDown}
											placeholder={
												isTranscribing
													? "Transcribing..."
													: "Type something here..."
											}
											ref={textareaRef}
											value={message}
										/>
									</div>
								</div>
							)}
						</motion.div>
					</>
				)}
			</motion.div>
		</form>
	);
}

function ActivityIndicator({
	activity,
	theme,
}: {
	activity: OnaActivity;
	theme: "light" | "dark";
}) {
	if (activity === "thinking") {
		return (
			<div className="flex items-center gap-3 px-2 py-2 text-sm text-muted-foreground">
				<ThinkingOrb state="working" size={20} theme={theme} />
				<span>Thinking...</span>
			</div>
		);
	}

	const config = {
		searching: {
			label: "Searching the web",
			title: "Looking up current information",
			category: "search" as const,
		},
		checking_data: {
			label: "Checking your business data",
			title: "Reading readiness and documents",
			category: "file" as const,
		},
		running_action: {
			label: "Running action",
			title: "Processing your request",
			category: "command" as const,
		},
	}[activity];

	return (
		<ToolGroup
			className="px-2 py-1"
			completeLabel={config.label}
			interruptedLabel={`${config.label} interrupted`}
			nestedTools={[{ category: config.category, title: config.title }]}
			shimmerLabel={config.label}
			showElapsed={false}
			state="pending"
		/>
	);
}

function DockButton({
	disabled = false,
	icon,
	label,
	onClick,
	type = "button",
}: {
	disabled?: boolean;
	icon: ReactNode;
	label: string;
	onClick?: () => void;
	shortcut?: string;
	type?: "button" | "submit";
}) {
	return (
		<button
			className="flex h-9 items-center gap-1.5 rounded-lg px-1.5 text-sm font-medium hover:bg-muted"
			disabled={disabled}
			onClick={onClick}
			type={type}
		>
			<span className="size-4">{icon}</span>
			<span>{label}</span>
		</button>
	);
}

export default AgentDock;
