import type { Metadata } from "next";
import Link from "next/link";
import { ContactLine, LegalPage, Section } from "@/components/ui/LegalPage";

export const metadata: Metadata = {
	title: "Privacy Policy · OnRecord",
	description: "What OnRecord collects, why, who helps us process it, and your rights over it.",
};

export default function PrivacyPage() {
	return (
		<LegalPage
			title="Privacy Policy"
			intro="OnRecord turns your business records into a financial record you can show a lender. This page explains what we collect, why we need it, who helps us process it, and what you can do about it. We wrote it in plain words; if anything is unclear, ask us."
		>
			<Section title="What we collect">
				<ul>
					<li><strong>Your account:</strong> your name, email address and password (stored scrambled, never in plain text), or your Google profile if you sign in with Google.</li>
					<li><strong>Your business details:</strong> business name, what the business does, region, registration number, TIN or Ghana Card number and tax status, if you give them.</li>
					<li><strong>What you upload:</strong> MoMo and bank statements, receipts, invoices, photos of record books, spreadsheets, pasted SMS alerts, and anything else you add.</li>
					<li><strong>What we work out from it:</strong> the transactions we read, how they are sorted, your readiness score and the figures on your Lender summary.</li>
					<li><strong>Records you type in or sync:</strong> cash sales and costs you add by hand, and rows from a Google Sheet you connect.</li>
					<li><strong>Your chats with Ona:</strong> your questions, voice notes you record for Ona, and Ona&apos;s answers.</li>
					<li><strong>Basic technical data:</strong> sign-in sessions and logs of changes to your records, so we can keep your account secure and show where every figure came from.</li>
				</ul>
			</Section>

			<Section title="Why we use it">
				<ul>
					<li>To read your documents and build your financial record.</li>
					<li>To show you your money, your readiness score and what is missing.</li>
					<li>To let Ona answer questions about your own business.</li>
					<li>To check uploads that need a closer look. OnRecord reviewers may open a file to approve it or ask you for a better copy.</li>
					<li>To send you account emails, such as password reset links.</li>
					<li>To keep the service secure and to fix problems.</li>
				</ul>
				<p>We do not sell your data. We do not use it for advertising. We do not lend money or make loan decisions.</p>
			</Section>

			<Section title="Who sees your records">
				<p>
					<strong>Lenders only see what you show them.</strong> OnRecord does not send your records or your Lender
					summary to any bank, microfinance company, co-op or the Ghana Revenue Authority. You decide when to save
					your summary and who to give it to.
				</p>
				<p>To run OnRecord we use a small number of service providers. They process data only to provide their service to us:</p>
				<ul>
					<li><strong>Hosting and storage:</strong> the servers, database and file storage that hold your account and uploads.</li>
					<li><strong>AI providers:</strong> companies whose AI models read your documents, transcribe voice notes and write Ona&apos;s answers. They receive the content needed for each task.</li>
					<li><strong>Web search:</strong> when Ona looks up outside facts, such as GRA rules, search words taken from your question go to a search engine. Your uploads and records are not sent.</li>
					<li><strong>Google:</strong> if you sign in with Google or connect a Google Sheet. We only read the sheet you choose and never change it.</li>
					<li><strong>Email delivery:</strong> to send account emails.</li>
				</ul>
				<p>Some of these providers store or process data outside Ghana. We choose providers that protect data with security measures at least as strong as ours.</p>
				<p>We may also share data if the law requires it, for example a valid court order.</p>
			</Section>

			<Section title="How long we keep it">
				<p>
					We keep your records while your account is open, so your history stays complete. You can delete a single
					upload from Records, or your whole account from Settings. Deleting your account permanently removes your
					login, business profile, uploads, transactions and everything worked out from them from our live systems.
					Copies in backups are deleted as those backups expire.
				</p>
			</Section>

			<Section title="Your rights">
				<p>Under Ghana&apos;s Data Protection Act, 2012 (Act 843) you can:</p>
				<ul>
					<li>ask what personal data we hold about you and get a copy;</li>
					<li>ask us to correct data that is wrong;</li>
					<li>ask us to delete your data, or delete your account yourself in Settings;</li>
					<li>object to how we use your data;</li>
					<li>complain to the Data Protection Commission of Ghana.</li>
				</ul>
				<p>To use any of these rights, <ContactLine />.</p>
			</Section>

			<Section title="Keeping it safe">
				<p>
					Your data travels over encrypted connections, and only signed-in owners and authorised OnRecord staff can
					reach it. No system is perfectly secure; if a breach affects you, we will tell you and the Data Protection
					Commission as the law requires.
				</p>
			</Section>

			<Section title="Children">
				<p>OnRecord is for business owners aged 18 and over.</p>
			</Section>

			<Section title="Changes and contact">
				<p>
					If we change this policy in a way that matters, we will tell you in the app or by email before it takes
					effect. For questions about your data, <ContactLine />. See also our <Link href="/terms" className="underline underline-offset-2">Terms of Use</Link>.
				</p>
			</Section>
		</LegalPage>
	);
}
