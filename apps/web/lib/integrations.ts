export type AppIntegration = {
	name: string;
	desc: string;
	icon?: "google-sheets";
};

/** Cards on the Integrations page. Only Google Sheets works today; the rest show "Coming soon". */
export const APP_INTEGRATIONS: AppIntegration[] = [
	{
		name: "Google Sheets",
		desc: "Bring in a sales book or cash book you keep in Google Sheets, and keep it up to date.",
		icon: "google-sheets",
	},
	{
		name: "Paystack",
		desc: "Bring in your Paystack payouts so you don't have to upload statements.",
	},
	{
		name: "MTN MoMo",
		desc: "Connect your MoMo wallet so your history comes in by itself, without requesting a statement.",
	},
	{
		name: "Bank feeds (GCB, Fidelity, Absa)",
		desc: "A read-only link to your bank account, once Ghanaian banks allow it.",
	},
	{
		name: "Gmail",
		desc: "Find invoices and receipts in your business email.",
	},
];
