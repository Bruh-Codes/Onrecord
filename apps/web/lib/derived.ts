import {
  CASH_BUFFER_DAYS_BY_RESOLVED_COUNT,
  DEMO_TRANSACTIONS,
  SCORE_BY_RESOLVED_COUNT,
  UNCLASSIFIED_VALUE_BY_RESOLVED_COUNT,
} from "./mock-data";
import type {
  Counterparty,
  DocumentItem,
  Gap,
  ReviewItem,
  ReviewStatus,
  ScoreSnapshot,
} from "./types";
import type { AppState } from "./app-state-types";

export function resolvedCount(state: AppState): number {
  return Object.values(state.resolved).filter(Boolean).length;
}

export function getScore(state: AppState): ScoreSnapshot {
  return SCORE_BY_RESOLVED_COUNT[Math.min(resolvedCount(state), 3)];
}

export function getCashBufferDays(state: AppState): number {
  return CASH_BUFFER_DAYS_BY_RESOLVED_COUNT[Math.min(resolvedCount(state), 3)];
}

export function getUnclassifiedValue(state: AppState): string {
  return UNCLASSIFIED_VALUE_BY_RESOLVED_COUNT[Math.min(resolvedCount(state), 3)];
}

export function getCoverage(state: AppState) {
  const covered = state.resolved.coverage;
  return {
    label: covered ? "12 / 12 months" : "9 / 12 months",
    detail: covered ? "Fully covered" : "3 months still missing",
    positive: covered,
  };
}

const ALL_GAPS: Gap[] = [
  {
    key: "stockList",
    severity: "blocker",
    title: "Missing current stock list",
    detail: "Required for the working-capital rule pack; dated within 14 days.",
    canAskAssistant: true,
    canUpload: true,
  },
  {
    key: "coverage",
    severity: "major",
    title: "Statement coverage gap",
    detail: "MoMo history missing 3 Feb – 3 May.",
    canAskAssistant: false,
    canUpload: true,
  },
  {
    key: "adomVentures",
    severity: "major",
    title: "Unclassified counterparty: Adom Ventures",
    detail: "GH¢12,400 across 34 transactions, last 6 months.",
    canAskAssistant: true,
    canUpload: false,
  },
  {
    key: "oneOff",
    severity: "minor",
    title: "Unexplained one-off inflow",
    detail: "GH¢18,000 from Nana Yeboah, 14 March.",
    canAskAssistant: true,
    canUpload: false,
  },
];

export function getOpenGaps(state: AppState): Gap[] {
  return ALL_GAPS.filter((g) => !state.resolved[g.key]);
}

export function getResolvedGaps(state: AppState): Gap[] {
  return ALL_GAPS.filter((g) => state.resolved[g.key]);
}

export function getDocumentItems(state: AppState): DocumentItem[] {
  return [
    {
      key: "coverage",
      label: "MoMo statements",
      detail: state.resolved.coverage ? "12 of 12 months" : "9 of 12 months — 3 Feb to 3 May missing",
      done: state.resolved.coverage,
      actionLabel: state.resolved.coverage ? undefined : "Upload missing window",
    },
    { label: "Bank statements", detail: "Optional for this facility", done: true, static: true },
    {
      label: "Business registration certificate",
      detail: "Certificate of Incorporation",
      done: true,
      static: true,
    },
    { label: "TIN / Ghana Card", detail: "Tax identification", done: true, static: true },
    { label: "Tenancy agreement", detail: "Premises: rented", done: true, static: true },
    {
      key: "stockList",
      label: "Current stock list",
      detail: "Must be dated within 14 days",
      done: state.resolved.stockList,
      actionLabel: state.resolved.stockList ? undefined : "Upload stock list",
    },
  ];
}

export function getCounterparties(state: AppState): Counterparty[] {
  return [
    {
      name: "Adom Ventures",
      txns: "34 transactions",
      value: "GH¢12,400",
      classified: state.resolved.adomVentures,
      role: state.resolved.adomVentures ? state.adomRole ?? "" : "Unclassified",
      needsAction: !state.resolved.adomVentures,
      demoTxns: DEMO_TRANSACTIONS["Adom Ventures"],
    },
    {
      name: "Nana Yeboah",
      txns: "1 transaction",
      value: "GH¢18,000",
      classified: state.resolved.oneOff,
      role: state.resolved.oneOff ? state.oneOffRole ?? "" : "Unclassified one-off",
      needsAction: !state.resolved.oneOff,
      demoTxns: DEMO_TRANSACTIONS["Nana Yeboah"],
    },
    {
      name: "Kofi Mensah Enterprise",
      txns: "21 transactions",
      value: "GH¢9,800",
      classified: true,
      role: "Customer",
      needsAction: false,
      demoTxns: [],
    },
    {
      name: "ECG (Electricity Company of Ghana)",
      txns: "12 transactions",
      value: "GH¢2,640",
      classified: true,
      role: "Utility / opex",
      needsAction: false,
      demoTxns: [],
    },
    {
      name: "GRA",
      txns: "6 transactions",
      value: "GH¢4,150",
      classified: true,
      role: "Tax",
      needsAction: false,
      demoTxns: [],
    },
  ];
}

const REVIEW_BASE: { id: number; doc: string; field: string; confidencePct: number; note: string; value: string; defaultStatus: ReviewStatus }[] = [
  {
    id: 1,
    doc: "MoMo statement — Feb 2026.pdf",
    field: "closing_balance",
    confidencePct: 61,
    note: "Balance reconciliation off by GH¢0.40 against opening + flows.",
    value: "GH¢ 4,812.60",
    defaultStatus: "Open",
  },
  {
    id: 2,
    doc: "Receipt_0842.jpg",
    field: "amount",
    confidencePct: 54,
    note: "Photo is blurry — thumb partially covers the total.",
    value: "GH¢ 220.00",
    defaultStatus: "Open",
  },
  {
    id: 3,
    doc: "Handwritten ledger, p.12",
    field: "line_item[7].amount",
    confidencePct: 68,
    note: "Low-verifiability document type — informal ledger.",
    value: "GH¢ 65.00",
    defaultStatus: "Open",
  },
  {
    id: 4,
    doc: "GCB statement — Jan 2026.pdf",
    field: "counterparty_raw",
    confidencePct: 70,
    note: "Resolved by reviewer on prior pass.",
    value: "KOFI MENSAH ENT",
    defaultStatus: "Approved",
  },
];

export function getReviewItems(state: AppState): ReviewItem[] {
  return REVIEW_BASE.map((r) => ({
    id: r.id,
    doc: r.doc,
    field: r.field,
    confidencePct: r.confidencePct,
    note: r.note,
    value: r.value,
    status: state.reviewStatuses[r.id] ?? r.defaultStatus,
  }));
}

export function getCollapsedSteps(state: AppState) {
  return [
    { n: 2, title: "Upload a current stock list", done: state.resolved.stockList },
    { n: 3, title: "Request the missing MoMo statement window", done: state.resolved.coverage },
    { n: 4, title: "Add your tenancy agreement", done: true },
    { n: 5, title: "Review GRA e-VAT invoices for verification", done: false },
  ];
}
