/** TypeScript mirrors of the apps/api Pydantic response schemas.
 * Kept minimal — only the fields the UI actually consumes. */

export type Role = "owner" | "reviewer" | "admin";

export type Me = {
  user_id: string;
  role: Role;
  business_id: string | null;
  institution_id: string | null;
  business: Business | null;
};

export type Business = {
  id: string;
  legal_name: string;
  trading_name: string | null;
  entity_type: string;
  registration_number: string | null;
  tin: string | null;
  sector_code: string | null;
  established_on: string | null;
  region: string | null;
  premises_status: { value: string } | null;
  employee_count_declared: { value: number } | null;
};

export type CoverageRange = { from: string; to: string };

export type AccountCoverage = {
  account_id: string;
  covered: CoverageRange[];
  holes: CoverageRange[];
};

export type Coverage = {
  accounts: AccountCoverage[];
  analysis_window: CoverageRange;
  analysis_window_months: number;
  continuous_months: number;
};

export type Indicator = {
  id: string;
  code: string;
  period_start: string;
  period_end: string;
  value_json: Record<string, unknown>;
  unit: string;
  formula_version: string;
  inputs: Record<string, unknown>;
  computed_at: string;
};

export type Band = "not_ready" | "developing" | "nearly_ready" | "lender_ready";

export type ReadinessScore = {
  id: string;
  business_id: string;
  computed_at: string;
  rubric_version: string;
  total: number;
  band: Band;
  pillars: Record<string, { earned: number; available: number }>;
  contributions: Array<{ code: string; pillar: string; earned: number; available: number; reason: string }>;
};

export type ChecklistItem = {
  id: string;
  rule_pack_id: string;
  doc_type: string;
  requirement: string;
  condition_expr: string | null;
  constraint_json: Record<string, unknown> | null;
  satisfied_by_document_id: string | null;
  status: string;
};

export type GapKind = "missing_period" | "missing_doc" | "coverage_gap" | "data_quality";
export type GapSeverity = "blocker" | "major" | "minor";
export type GapStatus = "open" | "waived";

export type Gap = {
  id: string;
  kind: GapKind;
  severity: GapSeverity;
  code: string;
  title: string;
  detail: string | null;
  target_ref: Record<string, unknown>;
  status: GapStatus;
  resolution: Record<string, unknown> | null;
  resolved_at: string | null;
  created_at: string;
};

export type DocumentStatus = "uploaded" | "processing" | "extracted" | "confirmed" | "failed" | "deleted";

export type Document = {
  id: string;
  doc_type: string | null;
  doc_type_confidence: number | null;
  issuer: string | null;
  period_start: string | null;
  period_end: string | null;
  status: DocumentStatus;
  created_at: string;
};

export type UploadTarget = {
  document_id: string;
  upload_url: string;
  upload_expires_at: string;
};

export type CounterpartyKind = "unknown" | "customer" | "supplier" | "utility" | "tax" | "financing" | "personal" | "transfer";

export type Counterparty = {
  id: string;
  business_id: string;
  canonical_name: string;
  display_suffix: string | null;
  kind: CounterpartyKind;
  first_seen: string | null;
  last_seen: string | null;
  txn_count: number;
  total_in_pesewas: number;
  total_out_pesewas: number;
};

export type Transaction = {
  id: string;
  occurred_on: string;
  direction: string;
  amount_pesewas: number;
  fee_pesewas: number;
  levy_pesewas: number;
  balance_after_pesewas: number | null;
  counterparty_raw: string | null;
  category_l1: string | null;
  category_l2: string | null;
  category_source: string | null;
  flags: Record<string, unknown>;
};