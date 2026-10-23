import type { Business } from "./api-types";

export type Page<T> = { items: T[]; total: number; page: number; page_size: number };
export type FarmType = "crop" | "livestock" | "aquaculture";
export type FarmKind = "income" | "expense";
export type Enterprise = {
	id: string;
	business_id: string;
	name: string;
	type: FarmType;
	subtype: string;
	region: string | null;
	metadata_json: { area?: number | null; area_unit?: "acres" | "hectares" | null };
};
export type Cycle = {
	id: string;
	business_id: string;
	enterprise_id: string;
	name: string;
	start_date: string;
	end_date: string | null;
	expected_harvest_date: string | null;
	stage: "planned" | "active" | "completed";
	metadata_json: { batch_size?: number | null; pond_count?: number | null };
};
export type EntryWrite = {
	enterprise_id: string | null;
	cycle_id: string | null;
	shared_overhead: boolean;
	kind: FarmKind;
	occurred_on: string;
	amount_pesewas: number | null;
	category: string;
	description: string;
	source_transaction_id: string | null;
	evidence_document_id: string | null;
	currency: "GHS";
};
export type FarmEntry = Omit<EntryWrite, "amount_pesewas"> & {
	id: string;
	business_id: string;
	enterprise_name: string | null;
	amount_pesewas: number;
	fee_pesewas: number;
	levy_pesewas: number;
	value_kind: "declared" | "extracted";
	evidence_status: "none" | "attached";
	updated_at: string;
};
export type Totals = {
	receipts_pesewas: number;
	expenditures_pesewas: number;
	surplus_pesewas: number;
	count: number;
	without_evidence: number;
};
export type FinanceGroup = Totals & { key: string; label: string };
export type FarmReport = {
	business_id: string;
	business_name: string;
	region: string | null;
	is_demo: boolean;
	generated_at: string;
	period_from: string | null;
	period_to: string | null;
	enterprise_id: string | null;
	cycle_id: string | null;
	totals: Totals;
	sources: Record<"declared" | "extracted", Totals>;
	enterprises: FinanceGroup[];
	months: FinanceGroup[];
	warnings: string[];
	insights: string[];
	method: string;
	formula_version: string;
	record_version: string;
	independent_verification: false;
	entries: FarmEntry[];
};
export type FarmFilters = { enterprise_id?: string; cycle_id?: string; from?: string; to?: string };
export type FarmOptions = {
	templates: Record<FarmType, { subtypes: string[]; income: string[]; expense: string[] }>;
	overhead_categories: string[];
	demo_enabled: boolean;
};
export type DemoResult = { items: Business[]; fictional: true };
