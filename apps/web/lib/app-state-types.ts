import type { ChatMessage, ResolvedMap, ReviewStatus, RulePackName } from "./types";

export type UploadedFile = { id: string; name: string };

export type AppState = {
  resolved: ResolvedMap;
  adomRole: string | null;
  oneOffRole: string | null;
  draftMode: boolean;
  rulePack: RulePackName;
  uploadedFiles: UploadedFile[];
  declaredFacts: string[];
  chatLog: ChatMessage[];
  chatIndex: number;
  reviewStatuses: Record<number, ReviewStatus>;
};

export const INITIAL_APP_STATE: AppState = {
  resolved: { adomVentures: false, coverage: false, oneOff: false, stockList: false },
  adomRole: null,
  oneOffRole: null,
  draftMode: false,
  rulePack: "MFI working capital",
  uploadedFiles: [],
  declaredFacts: [],
  chatLog: [],
  chatIndex: 0,
  reviewStatuses: {},
};
