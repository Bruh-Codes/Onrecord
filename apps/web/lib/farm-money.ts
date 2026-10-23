/** Parse the user's decimal string without floating-point multiplication. */
export function parsePesewas(value: string): number {
	const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
	if (!match) throw new Error("Enter a positive GHS amount with at most two decimal places.");
	const amount = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
	if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1_000_000_000_000)
		throw new Error("Enter a positive amount within the supported range.");
	return amount;
}

export function decimalGhs(pesewas: number): string {
	return `${Math.floor(Math.abs(pesewas) / 100)}.${String(Math.abs(pesewas) % 100).padStart(2, "0")}`;
}

export function farmMoney(pesewas: number): string {
	const whole = Math.floor(Math.abs(pesewas) / 100).toLocaleString("en-GH");
	return `GH₵${pesewas < 0 ? "−" : ""}${whole}.${String(Math.abs(pesewas) % 100).padStart(2, "0")}`;
}

export function accraDate(): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Africa/Accra",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
}
