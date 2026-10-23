/**
 * Plain-language labels and "what to do next" items for the readiness pages.
 * Gaps and missing checklist documents are turned into one ordered list so the
 * owner sees a single to-do list instead of two technical ones.
 */

import type { Band, ChecklistItem, Gap } from "@/lib/api-types";

export const DOC_TYPE_LABELS: Record<string, string> = {
	momo_statement: "MoMo statement",
	momo_merchant_statement: "MoMo merchant statement",
	bank_statement: "Bank statement",
	invoice_issued: "Invoices you sent",
	invoice_received: "Bills you received",
	receipt: "Receipts",
	informal_ledger: "Record book or ledger",
	registration_cert: "Business registration certificate",
	tax_doc: "Tax document (TIN or GRA filing)",
	tenancy_agreement: "Tenancy or land agreement",
	stock_list: "Stock or inventory list",
	financial_statement: "Financial statements",
	cashflow_projection: "Cash flow plan",
	id_document: "Ghana Card or other ID",
	other: "Other document",
};

export function docTypeLabel(docType: string | null | undefined): string {
	if (!docType) return "Document";
	return DOC_TYPE_LABELS[docType] ?? docType.replaceAll("_", " ");
}

/** Gap titles written before rule-pack labels reached the API read
 * "registration_cert is missing"; show a plain name instead. */
export function gapTitle(gap: Gap): string {
	const docType = typeof gap.target_ref?.doc_type === "string" ? gap.target_ref.doc_type : null;
	if (gap.kind === "missing_document" && docType && gap.title.startsWith(`${docType} `)) {
		return `${docTypeLabel(docType)} is missing`;
	}
	return gap.title;
}

export const BAND_LABELS: Record<Band, string> = {
	not_ready: "Not ready yet",
	developing: "Developing",
	nearly_ready: "Nearly ready",
	lender_ready: "Lender ready",
};

export const BAND_MEANING: Record<Band, string> = {
	not_ready: "A lender would not have enough to assess you yet. Start by adding statements that cover your recent months.",
	developing: "Your record is taking shape. Fill the gaps below so a lender can see a full year of activity.",
	nearly_ready: "You are close. A few items below would make your record complete.",
	lender_ready: "Your record is complete enough to share with a bank or microfinance lender.",
};

export type NextStep = {
	id: string;
	title: string;
	detail: string;
	severity: "blocker" | "major" | "minor";
	action: "upload" | "ask" | "categorise";
	/** Question handed to Ona when the owner taps "Ask Ona". */
	prompt: string;
};

const SEVERITY_ORDER = { blocker: 0, major: 1, minor: 2 } as const;

export function buildNextSteps(gaps: Gap[] | undefined, checklist: ChecklistItem[] | undefined): NextStep[] {
	const steps: NextStep[] = [];
	const openGaps = (gaps ?? []).filter((gap) => gap.status === "open");
	const gapDocTypes = new Set<string>();

	for (const gap of openGaps) {
		const docType = typeof gap.target_ref?.doc_type === "string" ? gap.target_ref.doc_type : null;
		if (docType) gapDocTypes.add(docType);
		const action: NextStep["action"] =
			gap.kind === "missing_period" || gap.kind === "missing_document"
				? "upload"
				: gap.kind === "ambiguous_category" || gap.kind === "unexplained_txn"
					? "categorise"
					: "ask";
		const title = gapTitle(gap);
		steps.push({
			id: gap.id,
			title,
			detail: gap.detail ?? "",
			severity: gap.severity,
			action,
			prompt: `Help me fix this item on my record: "${title}". ${gap.detail ?? ""} What exactly do I need to do?`.trim(),
		});
	}

	for (const item of checklist ?? []) {
		if (item.status !== "missing" || gapDocTypes.has(item.doc_type)) continue;
		const label = docTypeLabel(item.doc_type);
		steps.push({
			id: item.id,
			title: `Add your ${label.toLowerCase()}`,
			detail: item.requirement === "optional" ? "Optional, but it makes your file stronger." : "Lenders ask for this.",
			severity: item.requirement === "optional" ? "minor" : "major",
			action: "upload",
			prompt: `Lenders want my ${label.toLowerCase()}. Where do I get it in Ghana and what should it show?`,
		});
	}

	return steps.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
