"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { CHAT_SCRIPT } from "./mock-data";
import { INITIAL_APP_STATE, type AppState } from "./app-state-types";
import type { GapKey, ReviewStatus, RulePackName } from "./types";

type AppActions = {
  resolveGap: (key: GapKey) => void;
  undoGap: (key: GapKey) => void;
  classifyAdom: (role: string) => void;
  undoAdom: () => void;
  classifyOneOff: (role: string) => void;
  undoOneOff: () => void;
  toggleDraftMode: () => void;
  setRulePack: (name: RulePackName) => void;
  addDeclaredFact: (text: string) => void;
  setReviewStatus: (id: number, status: ReviewStatus) => void;
  startChat: () => void;
  chooseChatReply: (choiceIndex: 0 | 1) => void;
  submitCustomChatReply: (text: string) => void;
};

const AppStateContext = createContext<AppState | null>(null);
const AppActionsContext = createContext<AppActions | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(INITIAL_APP_STATE);

  const actions = useMemo<AppActions>(
    () => ({
      resolveGap: (key) => setState((s) => ({ ...s, resolved: { ...s.resolved, [key]: true } })),
      undoGap: (key) => setState((s) => ({ ...s, resolved: { ...s.resolved, [key]: false } })),
      classifyAdom: (role) =>
        setState((s) => ({ ...s, adomRole: role, resolved: { ...s.resolved, adomVentures: true } })),
      undoAdom: () =>
        setState((s) => ({ ...s, adomRole: null, resolved: { ...s.resolved, adomVentures: false } })),
      classifyOneOff: (role) =>
        setState((s) => ({ ...s, oneOffRole: role, resolved: { ...s.resolved, oneOff: true } })),
      undoOneOff: () =>
        setState((s) => ({ ...s, oneOffRole: null, resolved: { ...s.resolved, oneOff: false } })),
      toggleDraftMode: () => setState((s) => ({ ...s, draftMode: !s.draftMode })),
      setRulePack: (name) => setState((s) => ({ ...s, rulePack: name })),
      addDeclaredFact: (text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        setState((s) => ({ ...s, declaredFacts: [trimmed, ...s.declaredFacts] }));
      },
      setReviewStatus: (id, status) =>
        setState((s) => ({ ...s, reviewStatuses: { ...s.reviewStatuses, [id]: status } })),
      startChat: () =>
        setState((s) =>
          s.chatLog.length === 0
            ? { ...s, chatLog: [{ fromAgent: true, text: CHAT_SCRIPT[0].question }] }
            : s
        ),
      chooseChatReply: (choiceIndex) =>
        setState((s) => advanceChat(s, CHAT_SCRIPT[s.chatIndex].choices[choiceIndex].label, CHAT_SCRIPT[s.chatIndex].choices[choiceIndex].response)),
      submitCustomChatReply: (text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        setState((s) =>
          advanceChat(
            s,
            trimmed,
            "Got it — recorded as a figure you stated, shown separately from verified data for a reviewer to confirm."
          )
        );
      },
    }),
    []
  );

  return (
    <AppStateContext.Provider value={state}>
      <AppActionsContext.Provider value={actions}>{children}</AppActionsContext.Provider>
    </AppStateContext.Provider>
  );
}

function advanceChat(s: AppState, ownerText: string, agentResponse: string): AppState {
  const step = CHAT_SCRIPT[s.chatIndex];
  const log = [...s.chatLog, { fromAgent: false, text: ownerText }, { fromAgent: true, text: agentResponse }];
  const nextIndex = s.chatIndex + 1;
  if (nextIndex < CHAT_SCRIPT.length) {
    log.push({ fromAgent: true, text: CHAT_SCRIPT[nextIndex].question });
  } else {
    log.push({ fromAgent: true, text: "That's everything for today." });
  }
  return {
    ...s,
    chatLog: log,
    chatIndex: nextIndex,
    resolved: { ...s.resolved, [step.key]: true },
  };
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}

export function useAppActions(): AppActions {
  const ctx = useContext(AppActionsContext);
  if (!ctx) throw new Error("useAppActions must be used within AppStateProvider");
  return ctx;
}
