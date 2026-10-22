import type { ChatMessage, ResolvedMap, ReviewStatus, RulePackName } from "./types";

export type AppState = {
  resolved: ResolvedMap;
  oneOffRole: string | null;
  draftMode: boolean;
  rulePack: RulePackName;
  declaredFacts: string[];
  chatLog: ChatMessage[];
  chatIndex: number;
  reviewStatuses: Record<number, ReviewStatus>;
};

export const INITIAL_APP_STATE: AppState = {
  resolved: { coverage: false, oneOff: false, stockList: false },
  oneOffRole: null,
  draftMode: false,
  rulePack: "MFI working capital",
  declaredFacts: [],
  chatLog: [],
  chatIndex: 0,
  reviewStatuses: {},
};
