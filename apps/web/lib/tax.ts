// The owner's own answer about how GRA taxes them. OnRecord shows it to
// lenders as context and never works out tax owed from it.
export const TAX_STATUS_OPTIONS = [
	{
		value: "farm_produce",
		label: "I mainly sell unprocessed farm produce",
		lender: "Mainly sells unprocessed farm produce",
	},
	{
		value: "flat_tax",
		label: "I pay GRA's small-business flat tax",
		lender: "Pays GRA's small-business flat tax",
	},
	{ value: "vat_registered", label: "I'm registered for VAT", lender: "VAT registered" },
	{ value: "not_sure", label: "I'm not sure", lender: null },
] as const;

export type TaxStatus = (typeof TAX_STATUS_OPTIONS)[number]["value"];

export function taxStatusForLender(value: string | null | undefined): string | null {
	return TAX_STATUS_OPTIONS.find((option) => option.value === value)?.lender ?? null;
}
