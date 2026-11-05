import Link from "next/link";
import type { ReactNode } from "react";
import { Footer } from "@/components/ui/Footer";
import { LEGAL_UPDATED, SUPPORT_EMAIL } from "@/lib/legal";

/** Plain reading layout for the Privacy Policy and Terms pages. */
export function LegalPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
	return (
		<div className="min-h-dvh flex flex-col bg-background text-foreground">
			<header className="flex items-center px-6 sm:px-10 py-5">
				<Link href="/" className="hover:opacity-100">
					<span className="font-display text-[19px]">OnRecord</span>
				</Link>
			</header>
			<main className="flex-1 px-4 sm:px-6 pb-16">
				<article className="legal mx-auto max-w-[680px] text-[15px] leading-relaxed">
					<h1 className="font-display text-[30px] sm:text-[36px] leading-tight m-0 mb-2">{title}</h1>
					<p className="text-[13px] opacity-60 m-0 mb-6">Last updated {LEGAL_UPDATED}</p>
					<p className="m-0 mb-8 opacity-85">{intro}</p>
					{children}
				</article>
			</main>
			<Footer />
		</div>
	);
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="mb-8">
			<h2 className="font-display text-[19px] m-0 mb-2.5">{title}</h2>
			<div className="opacity-85 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ul]:mb-0 [&_p]:mb-0 [&>*]:mt-0 [&>*+*]:!mt-3">{children}</div>
		</section>
	);
}

/** "email us at x" when an address is configured, otherwise a reply to any OnRecord email. */
export function ContactLine() {
	return SUPPORT_EMAIL ? (
		<>
			email us at{" "}
			<a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-2">
				{SUPPORT_EMAIL}
			</a>
		</>
	) : (
		<>reply to any email we have sent you</>
	);
}
