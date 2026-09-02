import type {
  AppIntegration,
  ChatStep,
  DemoTransaction,
  RulePackName,
  ScoreSnapshot,
  SeriesPoint,
} from "./types";

export const BUSINESS_NAME = "Adom Provisions Ltd";
export const OWNER_FIRST_NAME = "Comfort";

export const RULE_PACKS: RulePackName[] = [
  "MFI working capital",
  "Bank term loan",
  "Asset finance",
];

// index = number of resolved gaps (0-3, capped)
export const SCORE_BY_RESOLVED_COUNT: ScoreSnapshot[] = [
  { total: 58, band: "Developing" },
  { total: 65, band: "Nearly ready" },
  { total: 70, band: "Nearly ready" },
  { total: 74, band: "Nearly ready" },
];

export const CASH_BUFFER_DAYS_BY_RESOLVED_COUNT = [11, 12, 13, 14];
export const UNCLASSIFIED_VALUE_BY_RESOLVED_COUNT = [
  "GH¢16,900",
  "GH¢11,200",
  "GH¢7,400",
  "GH¢4,100",
];

export const REVENUE_SERIES: SeriesPoint[] = [
  { month: "Sep '25", value: 9100, x: 0, y: 80 },
  { month: "Oct '25", value: 9600, x: 40, y: 78 },
  { month: "Nov '25", value: 12400, x: 80, y: 70 },
  { month: "Dec '25", value: 28900, x: 120, y: 20 },
  { month: "Feb '26", value: 16200, x: 160, y: 55 },
  { month: "Apr '26", value: 14800, x: 200, y: 60 },
  { month: "Jun '26", value: 19300, x: 240, y: 40 },
  { month: "Aug '26", value: 9400, x: 320, y: 80 },
];

export const CASHFLOW_SERIES: SeriesPoint[] = [
  { month: "Sep '25", value: 3200, x: 0, y: 60 },
  { month: "Oct '25", value: 3600, x: 40, y: 58 },
  { month: "Nov '25", value: 2900, x: 80, y: 62 },
  { month: "Dec '25", value: 5100, x: 120, y: 50 },
  { month: "Feb '26", value: 9800, x: 160, y: 15 },
  { month: "Apr '26", value: 6000, x: 200, y: 45 },
  { month: "Jun '26", value: 5400, x: 240, y: 50 },
  { month: "Aug '26", value: 7100, x: 320, y: 35 },
];

export const DEMO_TRANSACTIONS: Record<string, DemoTransaction[]> = {
  "Adom Ventures": [
    { date: "2 Aug", desc: "Stock delivery", amount: "-GH¢1,200" },
    { date: "19 Jul", desc: "Stock delivery", amount: "-GH¢980" },
    { date: "5 Jul", desc: "Stock delivery", amount: "-GH¢1,450" },
  ],
  "Nana Yeboah": [{ date: "14 Mar", desc: "Transfer received", amount: "+GH¢18,000" }],
};

export const CHAT_SCRIPT: ChatStep[] = [
  {
    key: "adomVentures",
    question:
      "I can see GH¢12,400 going to ADOM VENTURES over the last six months. Is that a supplier you buy stock from?",
    hint: 'Answering this fills in your cost-of-goods figure and clears 34 transactions out of "unclassified."',
    choices: [
      {
        label: "Yes, a supplier",
        response:
          "Got it — I've recorded Adom Ventures as a supplier and applied it to all 34 transactions. Your cost-of-goods figure is in the ledger now.",
      },
      {
        label: "No, someone else",
        response: "Thanks — I've flagged that for a reviewer to confirm rather than guessing.",
      },
    ],
  },
  {
    key: "oneOff",
    question:
      "In March you received a one-off payment of GH¢18,000 from Nana Yeboah — about 6× your usual transaction size. What was it?",
    hint: "This flags whether it's revenue, a loan, or something else — lenders always ask about outliers like this.",
    choices: [
      {
        label: "A contract payment",
        response:
          "Recorded as a one-off contract payment, kept separate so it doesn't distort your average revenue.",
      },
      {
        label: "A personal loan",
        response: "Recorded as a personal loan, kept separate from business revenue.",
      },
    ],
  },
  {
    key: "stockList",
    question:
      "Your file is missing a current stock list — most working-capital lenders ask for one no older than two weeks.",
    hint: "A dated stock list is worth real points in your documentation pillar.",
    choices: [
      {
        label: "I'll upload one",
        response: "Good — once it's uploaded I'll match it against this requirement automatically.",
      },
      {
        label: "Tell you roughly instead",
        response:
          "Noted: about GH¢3,200 of stock on hand. Recorded as a figure you stated — shown separately from verified numbers.",
      },
    ],
  },
];

export const APP_INTEGRATIONS: AppIntegration[] = [
  {
    name: "Paystack",
    desc: "Pull settlement and payout history directly instead of uploading statements.",
  },
  {
    name: "MTN MoMo API",
    desc: "Skip the 90-day statement request — sync the wallet automatically.",
  },
  {
    name: "Bank feeds (GCB, Fidelity, Absa)",
    desc: "Direct read-only bank connections via open banking, when available in Ghana.",
  },
];
