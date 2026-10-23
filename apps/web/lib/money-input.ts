/** Typed money amounts and dates for records the owner adds by hand. */

/** Parse the user's decimal string without floating-point multiplication. */
export function parsePesewas(value: string): number {
	const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
	if (!match) throw new Error("Enter an amount in cedis, like 1350 or 1350.50.");
	const amount = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
	if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1_000_000_000_000)
		throw new Error("Enter an amount above zero.");
	return amount;
}

export function accraDate(): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Africa/Accra",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
}
