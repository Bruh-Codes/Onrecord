import { Footer } from "@/components/ui/Footer";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

const STEPS = [
	{
		n: "1",
		title: "Upload your records",
		body: "MoMo statements, bank statements, receipts, handwritten ledgers-photos or PDFs. Nothing gets thrown away or 'edited'.",
	},
	{
		n: "2",
		title: "We build the provable profile",
		body: "Every figure is extracted, derived, or declared-each traceable to a source page. Statements must reconcile before they enter the ledger.",
	},
	{
		n: "3",
		title: "Share it with your lender",
		body: "A readable financial profile plus an honest list of what's still missing. Verifiable, not just pretty.",
	},
];

const PILLARS = [
	{
		title: "Never a made-up number",
		body: "Three kinds of value-extracted, derived, declared-never mixed. Aggregation and scoring are deterministic code, not model output.",
	},
	{
		title: "Proof over polish",
		body: "Every figure carries where it came from. Fraud is actively screened and a server-side audit trail sits behind every profile.",
	},
	{
		title: "A score, not a decision",
		body: "A readiness score measures how complete and consistent your file is. It's tooling for you and your lender-never a lending decision.",
	},
];

export default async function LandingPage() {
	const session = await auth.api.getSession({ headers: await headers() });
	if (session) redirect("/dashboard");

	return (
		<div className="min-h-dvh flex flex-col bg-paper text-ink">
			<header className="flex items-center px-6 sm:px-10 py-5">
				<span className="font-[family-name:var(--font-display)] text-[19px]">
					Onrecord
				</span>
				<Link
					href="/signup"
					className="ml-auto inline-flex items-center bg-panel border border-ink/16 rounded-full px-4 py-2 text-[13.5px] hover:opacity-100"
				>
					Log in
				</Link>
			</header>

			<main className="flex-1">
				<section className="max-w-[720px] mx-auto text-center px-6 pt-12 sm:pt-20 pb-14 sm:pb-20 animate-fade-in">
					<h1 className="font-[family-name:var(--font-display)] text-left sm:text-center text-4xl sm:text-[52px] leading-[1.05] m-0 mb-5">
						When your records are messy, credit is out of reach
					</h1>
					<p className="text-left sm:text-center text-[15.5px] sm:text-base leading-relaxed opacity-75 m-0 mb-8 max-w-[560px] mx-auto">
						Onrecord turns a Ghanaian SME&apos;s real records-MoMo statements,
						receipts, a handwritten sales book-into a clean,{" "}
						<strong className="font-semibold">provable</strong>, lender-ready
						financial profile in under an hour.
					</p>

					<div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
						<Link
							href="/signup"
							className="inline-flex items-center justify-center bg-ink text-paper rounded-full px-7 py-3.5 text-[14.5px] font-[family-name:var(--font-display)]"
							style={{ color: "var(--color-paper)" }}
						>
							Get started free
						</Link>
						<Link
							href="#how-it-works"
							className="inline-flex items-center justify-center bg-surface border border-ink/16 rounded-full px-7 py-3.5 text-[14.5px]"
						>
							See how it works
						</Link>
					</div>

					<p className="text-left sm:text-center text-[12px] opacity-50 mt-6 mb-0">
						Built for GHS 20,000–200,000 · No bookkeeper needed · MoMo-first
					</p>
				</section>

				<section
					id="how-it-works"
					className="max-w-[1080px] mx-auto px-6 pb-16 sm:pb-24"
				>
					<div className="grid gap-5 sm:grid-cols-3">
						{STEPS.map((s) => (
							<div
								key={s.n}
								className="bg-surface rounded-3xl shadow-[var(--shadow-card)] p-6 sm:p-7"
							>
								<div className="w-8 h-8 rounded-full bg-ink text-paper flex items-center justify-center text-[13px] font-bold mb-5">
									{s.n}
								</div>
								<h3 className="font-[family-name:var(--font-display)] text-[17px] m-0 mb-2">
									{s.title}
								</h3>
								<p className="text-[13.5px] leading-relaxed opacity-70 m-0">
									{s.body}
								</p>
							</div>
						))}
					</div>
				</section>

				<section className="bg-panel border-y border-border py-14 sm:py-20">
					<div className="max-w-[560px] mx-auto text-center px-6 mb-10 sm:mb-12">
						<div className="text-[11px] tracking-wider uppercase opacity-55 mb-3">
							Built on a trust model
						</div>
						<h2 className="font-[family-name:var(--font-display)] text-[26px] sm:text-[32px] leading-tight m-0">
							Lenders can&apos;t trust what they can&apos;t trace
						</h2>
					</div>
					<div className="max-w-[1080px] grid gap-5 sm:grid-cols-3 mx-auto px-6">
						{PILLARS.map((p) => (
							<div key={p.title} className="bg-surface rounded-3xl p-6 sm:p-7">
								<h3 className="font-[family-name:var(--font-display)] text-[16px] m-0 mb-2">
									{p.title}
								</h3>
								<p className="text-[13.5px] leading-relaxed opacity-70 m-0">
									{p.body}
								</p>
							</div>
						))}
					</div>
				</section>

				<section className="max-w-[640px] mx-auto text-center px-6 py-16 sm:py-20">
					<h2 className="font-[family-name:var(--font-display)] text-[26px] sm:text-[32px] leading-tight m-0 mb-3">
						Your money deserves a file that tells the truth
					</h2>
					<p className="text-[15px] opacity-75 m-0 mb-7">
						Create your profile today and go to your first lender meeting with
						receipts-not charm.
					</p>
					<Link
						href="/signup"
						className="inline-flex items-center justify-center bg-ink text-paper rounded-full px-8 py-3.5 text-[14.5px] font-[family-name:var(--font-display)]"
						style={{ color: "var(--color-paper)" }}
					>
						Get started
					</Link>
				</section>
			</main>

			<Footer />
		</div>
	);
}
