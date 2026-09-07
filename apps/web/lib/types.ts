export type GapKey = "adomVentures" | "coverage" | "oneOff" | "stockList";

export type ResolvedMap = Record<GapKey, boolean>;

export type GapSeverity = "blocker" | "major" | "minor";

export type Gap = {
  key: GapKey;
  severity: GapSeverity;
  title: string;
  detail: string;
  canAskAssistant: boolean;
  canUpload: boolean;
};

export type DocumentItem = {
  key?: string;
  label: string;
  detail: string;
  done: boolean;
  actionLabel?: string;
  static?: boolean;
};

export type CounterpartyAction = {
  label: string;
  run: () => void;
  variant: "primary" | "secondary";
};

export type DemoTransaction = {
  date: string;
  desc: string;
  amount: string;
};

export type Counterparty = {
  name: string;
  txns: string;
  value: string;
  classified: boolean;
  role: string;
  needsAction: boolean;
  demoTxns: DemoTransaction[];
};

export type ChatChoice = {
  label: string;
  response: string;
};

export type ChatStep = {
  key: GapKey;
  question: string;
  hint: string;
  choices: [ChatChoice, ChatChoice];
};

export type ChatMessage = {
  fromAgent: boolean;
  text: string;
};

export type ReviewStatus = "Open" | "Approved" | "Flagged";

export type ReviewItem = {
  id: number;
  doc: string;
  field: string;
  confidencePct: number;
  note: string;
  value: string;
  status: ReviewStatus;
};

export type SeriesPoint = {
  month: string;
  value: number;
  x: number;
  y: number;
};

export type RulePackName = "MFI working capital" | "Bank term loan" | "Asset finance";

export type AppIntegration = {
  name: string;
  desc: string;
};

export type ScoreBand = "Not ready" | "Developing" | "Nearly ready" | "Lender-ready";

export type ScoreSnapshot = {
  total: number;
  band: ScoreBand;
};
