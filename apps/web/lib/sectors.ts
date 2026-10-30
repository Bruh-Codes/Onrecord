// What the business does, in the owner's words. Stored as a coarse ISIC rev4
// division (business.sector_code, 2 characters) so lenders and rule packs can
// read it; the labels are what the owner sees.
export const SECTOR_OPTIONS = [
	{ value: "47", label: "Shop, kiosk or market trading" },
	{ value: "46", label: "Wholesale or distribution" },
	{ value: "56", label: "Food, drinks or chop bar" },
	{ value: "10", label: "Food processing (gari, shea, palm oil…)" },
	{ value: "01", label: "Farming, livestock or fishing" },
	{ value: "96", label: "Hair, beauty or other personal services" },
	{ value: "14", label: "Tailoring, fashion or textiles" },
	{ value: "95", label: "Repairs (phones, cars, electronics)" },
	{ value: "49", label: "Transport or delivery" },
	{ value: "43", label: "Building and construction" },
	{ value: "62", label: "Tech, IT or digital services" },
	{ value: "82", label: "Other services" },
] as const;

export function sectorLabel(code: string | null | undefined): string | null {
	return SECTOR_OPTIONS.find((option) => option.value === code)?.label ?? null;
}
