import type { Metadata } from "next";
import Link from "next/link";
import { ContactLine, LegalPage, Section } from "@/components/ui/LegalPage";

export const metadata: Metadata = {
	title: "Terms of Use · OnRecord",
	description: "The rules for using OnRecord.",
};

export default function TermsPage() {
	return (
		<LegalPage
			title="Terms of Use"
			intro="These terms are the agreement between you and OnRecord when you use the app. By creating an account you accept them. Please read them; they are short."
		>
			<Section title="What OnRecord is">
				<p>
					OnRecord helps small businesses in Ghana turn their statements, receipts and record books into a clear
					financial record they can show a lender. <strong>OnRecord is not a lender.</strong> We do not give loans,
					decide who gets credit, or promise that any lender will approve you.
				</p>
				<p>
					The readiness score shows how complete and consistent your record is. It is not a credit score and not a
					loan decision. Each lender makes its own decision using its own rules.
				</p>
			</Section>

			<Section title="Your account">
				<ul>
					<li>You must be 18 or older.</li>
					<li>You may only add records for a business you own or are allowed to manage.</li>
					<li>Keep your password safe. You are responsible for what happens in your account.</li>
				</ul>
			</Section>

			<Section title="Honest records">
				<p>
					A lender can only trust your record if it is true. You agree not to upload documents you have changed,
					back-dated or made up, and not to type in figures you know are false. We may hold back, flag or remove
					records that look altered, and we may close accounts that use OnRecord to mislead lenders.
				</p>
			</Section>

			<Section title="Your data">
				<p>
					Your records stay yours. You let us store and process them only to run OnRecord for you, as explained in
					our <Link href="/privacy" className="underline underline-offset-2">Privacy Policy</Link>. You can delete
					uploads or your whole account at any time.
				</p>
			</Section>

			<Section title="How far you can rely on it">
				<ul>
					<li>
						We use AI to read documents, sort transactions and answer questions. It can make mistakes. Check the
						rows we read and the figures on your summary before you share them.
					</li>
					<li>Ona and OnRecord do not give legal, tax or investment advice. Speak to a qualified professional when it matters.</li>
					<li>We work to keep OnRecord available and accurate, but we provide it as it is and cannot promise it will always be free of errors or interruptions.</li>
				</ul>
			</Section>

			<Section title="Fair use">
				<p>Do not try to reach other people&apos;s data, break or overload the service, or use OnRecord for anything illegal.</p>
			</Section>

			<Section title="Responsibility">
				<p>
					As far as the law allows, OnRecord is not responsible for losses that come from a lender&apos;s decision, from
					records you uploaded, or from relying on figures you did not check. Nothing in these terms takes away rights
					you have under Ghanaian law that cannot be removed.
				</p>
			</Section>

			<Section title="Ending your account">
				<p>You can stop using OnRecord and delete your account in Settings whenever you like. We may suspend or close an account that breaks these terms.</p>
			</Section>

			<Section title="Changes, law and contact">
				<p>
					If we change these terms in a way that matters, we will tell you before the change takes effect. These
					terms are governed by the laws of Ghana. If you have questions, <ContactLine />.
				</p>
			</Section>
		</LegalPage>
	);
}
