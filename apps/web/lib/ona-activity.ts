export type OnaActivity = "thinking" | "searching" | "checking_data" | "running_action";

const PLATFORM_PHRASES = [
	"my readiness",
	"my score",
	"readiness score",
	"open gap",
	"my gap",
	"my document",
	"my upload",
	"my transaction",
	"retry stuck",
	"recompute",
	"refresh readiness",
	"stuck upload",
	"my checklist",
	"my indicator",
	"how many transaction",
	"money in",
	"money out",
	"what is my",
	"show my",
];

const GENERAL_SIGNALS = [
	"how do i",
	"how to",
	"what is",
	"what should",
	"start a business",
	"start business",
	"new business",
	"register",
	"gra",
	"tin",
	"tax",
	"loan",
	"lender",
	"bookkeep",
	"finance",
	"sme",
	"business plan",
	"latest",
	"current",
	"rate",
	"law",
	"requirement",
	"explain",
	"difference between",
	"ghana",
];

const CASUAL_PHRASES = new Set([
	"hi",
	"hello",
	"hey",
	"thanks",
	"thank you",
	"ok",
	"okay",
	"good morning",
	"good afternoon",
	"good evening",
]);

export function isCasualTurn(message: string): boolean {
	const lower = message.toLowerCase().trim();
	if (!lower) return false;
	if (CASUAL_PHRASES.has(lower)) return true;
	const words = lower.split(/\s+/);
	return (
		words.length <= 4 &&
		words.some((word) =>
			["hi", "hello", "hey", "thanks", "thank"].includes(word),
		)
	);
}

export function asksAboutPlatformData(message: string): boolean {
	const lower = message.toLowerCase();
	return PLATFORM_PHRASES.some((phrase) => lower.includes(phrase));
}

export function needsWebSearch(message: string): boolean {
	const lower = message.toLowerCase().trim();
	if (!lower || isCasualTurn(message)) return false;
	const platformOnly =
		asksAboutPlatformData(message) &&
		!GENERAL_SIGNALS.some((signal) => lower.includes(signal));
	if (platformOnly) return false;
	if (GENERAL_SIGNALS.some((signal) => lower.includes(signal))) return true;
	return lower.includes("?") || lower.split(/\s+/).length > 10;
}

export function detectOnaActivity(message: string): OnaActivity {
	if (isCasualTurn(message)) return "thinking";
	if (needsWebSearch(message)) {
		return asksAboutPlatformData(message) ? "checking_data" : "searching";
	}
	if (asksAboutPlatformData(message)) return "checking_data";
	return "thinking";
}

export function activityStatusLabel(activity: OnaActivity): string {
	switch (activity) {
		case "searching":
			return "Searching the web...";
		case "checking_data":
			return "Checking your business data...";
		case "running_action":
			return "Running action...";
		default:
			return "Thinking...";
	}
}
