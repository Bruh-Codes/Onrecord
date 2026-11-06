export type AppIntegration = {
	name: string;
	desc: string;
	icon: "google-sheets" | "paystack" | "mtn" | "bank" | "gmail";
};

/** Cards on the Integrations page. Only Google Sheets works today; the rest show "Coming soon". */
export const APP_INTEGRATIONS: AppIntegration[] = [
	{
		name: "Google Sheets",
		desc: "Pick your sales or cash book once. New rows come into OnRecord by themselves.",
		icon: "google-sheets",
	},
	{
		name: "Paystack",
		desc: "Your Paystack payments and payouts, without uploading statements.",
		icon: "paystack",
	},
	{
		name: "MTN MoMo",
		desc: "Your MoMo history comes in by itself, no statement request needed.",
		icon: "mtn",
	},
	{
		name: "Bank feeds",
		desc: "A read-only link to GCB, Fidelity or Absa, once Ghanaian banks allow it.",
		icon: "bank",
	},
	{
		name: "Gmail",
		desc: "Finds invoices and receipts in your business email.",
		icon: "gmail",
	},
];
