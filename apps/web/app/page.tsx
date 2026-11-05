import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SECTOR_OPTIONS } from "@/lib/sectors";
import icon from "@/public/icon.png";
import iconDark from "@/public/icon-dark.png";

const STEPS = [
	{
		n: "1",
		title: "Bring the records you have",
		body: "Upload MoMo or bank statements, receipts and photos of your sales book, or paste your MoMo SMS alerts. Nothing is thrown away.",
		visual: "upload",
	},
	{
		n: "2",
		title: "Get a clear financial profile",
		body: "See money in and out each month and what's left over. Every number links back to the page it came from.",
		visual: "profile",
	},
	{
		n: "3",
		title: "Use it to get financing",
		body: "Print your lender summary or send it as a PDF to any bank, microfinance company or susu group you choose.",
		visual: "share",
	},
] as const;

const PILLARS = [
	{
		title: "Never a made-up number",
		body: "Figures you typed in are kept apart from figures read off statements. Totals and the score are worked out by fixed rules, not guessed by AI.",
	},
	{
		title: "Proof over polish",
		body: "Every figure shows where it came from, and every change is logged, so a lender can check it.",
	},
	{
		title: "A score, not a decision",
		body: "A readiness score shows how complete and consistent your record is. It is never a loan decision, and OnRecord doesn't lend.",
	},
];

const RECORD_TYPES = [
	"MoMo statements",
	"Bank statements",
	"MoMo SMS alerts",
	"Receipts and invoices",
	"Handwritten sales books",
	"Excel or CSV sheets",
	"Screenshots",
	"Word documents",
];

const LENDER_SEES = [
	{
		title: "Your business health at a glance",
		body: "Money in and out each month and what's left over, worked out from your statements and books.",
	},
	{
		title: "Where every number came from",
		body: "Each figure points back to the page it was read from, or is marked as something you told us.",
	},
	{
		title: "What's still missing, and how to fix it",
		body: "An honest list of the gaps, so you can close them before you apply.",
	},
];

const FAQS = [
	{
		q: "Is OnRecord a lender?",
		a: "No. OnRecord doesn't lend money or make loan decisions. It builds a clear financial profile of your business that you can show to any bank, microfinance company, savings group or supplier you choose.",
	},
	{
		q: "How does it help me get a loan?",
		a: "Lenders want proof that money comes in steadily. OnRecord turns your records into a profile they can read and check, and shows you what's missing before you apply. It can't promise a loan: that decision is always the lender's.",
	},
	{
		q: "Do I need a bookkeeper or an accountant?",
		a: "No. Upload what you already have, or paste your MoMo SMS alerts. OnRecord reads the rows and you check them.",
	},
	{
		q: "What if my records are messy or handwritten?",
		a: "That's normal. A photo of a sales book, a screenshot or a half-filled spreadsheet all work. Anything we can't read clearly is held for you to check instead of being guessed.",
	},
	{
		q: "Who can see my profile?",
		a: "Only you, unless you choose to share it. You decide when to print your lender summary or send it as a PDF, and who gets it.",
	},
	{
		q: "Is it only for farms?",
		a: "No. OnRecord works for any small business in Ghana: shops, traders, chop bars, salons, tailors, repairers, transport, farms and more.",
	},
];

async function hasSession() {
	try {
		return Boolean(await auth.api.getSession({ headers: await headers() }));
	} catch {
		// If auth is unreachable, still show the landing page.
		return false;
	}
}

export default async function LandingPage() {
	// Signed-in visitors go straight into the app. /dashboard is where login
	// sends everyone; the (app) layout then sends owners without a business
	// to /setup, and reviewers/admins stay on /dashboard as they would after login.
	if (await hasSession()) {
		redirect("/dashboard");
	}

	return (
		<div className="min-h-dvh flex flex-col bg-background text-foreground">
			<header className="flex items-center px-6 sm:px-10 py-5">
				<Link href="/" className="inline-flex items-center gap-2 hover:opacity-100">
					<Image
						src={iconDark}
						alt="OnRecord"
						width={28}
						height={28}
						className="dark:hidden"
					/>
					<Image
						src={icon}
						alt=""
						width={28}
						height={28}
						className="hidden dark:block"
					/>
					<span className="font-display text-[19px]">
						OnRecord
					</span>
				</Link>
				<nav className="ml-auto mr-3 hidden sm:flex items-center gap-6 text-[13.5px] opacity-70">
					<a href="#how-it-works">How it works</a>
					<a href="#your-profile">Your profile</a>
					<a href="#questions">Questions</a>
				</nav>
				<Link
					href="/signup?mode=login"
					className="ml-auto sm:ml-0 inline-flex items-center bg-muted border border-foreground/16 rounded-full px-4 py-2 text-[13.5px] hover:opacity-100"
				>
					Log in
				</Link>
			</header>

			<main className="flex-1">
				<section className="max-w-[720px] mx-auto text-center px-6 pt-12 sm:pt-20 pb-14 sm:pb-20">
					<h1 className="font-display text-left sm:text-center text-4xl sm:text-[52px] leading-[1.05] m-0 mb-5">
						Know how your business is doing. Prove it to lenders.
					</h1>
					<p className="text-left sm:text-center text-[15.5px] sm:text-base leading-relaxed opacity-75 m-0 mb-8 max-w-[560px] mx-auto">
						OnRecord turns your financial records into a clear financial
						profile, so you can see how healthy your business is and find it
						easier to get a loan or other financial support.
					</p>

					<div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
						<Link
							href="/signup"
							className="inline-flex items-center justify-center bg-foreground text-background rounded-full px-7 py-3.5 text-[14.5px] font-display"
							style={{ color: "var(--background)" }}
						>
							Get started free
						</Link>
						<Link
							href="#how-it-works"
							className="inline-flex items-center justify-center bg-card border border-foreground/16 rounded-full px-7 py-3.5 text-[14.5px]"
						>
							See how it works
						</Link>
					</div>

					<p className="text-left sm:text-center text-[12px] opacity-50 mt-6 mb-0">
						For any small business in Ghana · No bookkeeper needed · Works with MoMo
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
								className="bg-card rounded-3xl shadow-card p-6 sm:p-7"
							>
								<StepVisual kind={s.visual} />
								<div className="w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center text-[13px] font-bold mb-4">
									{s.n}
								</div>
								<h3 className="font-display text-[17px] m-0 mb-2">
									{s.title}
								</h3>
								<p className="text-[13.5px] leading-relaxed opacity-70 m-0">
									{s.body}
								</p>
							</div>
						))}
					</div>
				</section>

				<section className="max-w-[1080px] mx-auto px-6 pb-16 sm:pb-24">
					<div className="grid gap-10 sm:gap-14 sm:grid-cols-2">
						<div>
							<div className="text-[11px] tracking-wider uppercase opacity-55 mb-3">
								What you can bring
							</div>
							<h2 className="font-display text-[24px] sm:text-[28px] leading-tight m-0 mb-3">
								Start with the records you already keep
							</h2>
							<p className="text-[14px] leading-relaxed opacity-70 m-0 mb-5">
								Any layout works. We read it, and you check the rows before
								anything goes into your profile.
							</p>
							<ul className="flex flex-wrap gap-2 list-none p-0 m-0">
								{RECORD_TYPES.map((r) => (
									<li
										key={r}
										className="bg-card border border-border rounded-full px-3.5 py-1.5 text-[13px]"
									>
										{r}
									</li>
								))}
							</ul>
						</div>
						<div>
							<div className="text-[11px] tracking-wider uppercase opacity-55 mb-3">
								Who it&apos;s for
							</div>
							<h2 className="font-display text-[24px] sm:text-[28px] leading-tight m-0 mb-3">
								Any small business in Ghana
							</h2>
							<p className="text-[14px] leading-relaxed opacity-70 m-0 mb-5">
								If money moves through MoMo, a bank or a cash book, OnRecord
								can turn it into a clear financial profile.
							</p>
							<ul className="flex flex-wrap gap-2 list-none p-0 m-0">
								{SECTOR_OPTIONS.map((sector) => (
									<li
										key={sector.value}
										className="bg-muted border border-border rounded-full px-3.5 py-1.5 text-[13px]"
									>
										{sector.label}
									</li>
								))}
							</ul>
						</div>
					</div>
				</section>

				<section className="bg-muted border-y border-border py-14 sm:py-20">
					<div className="max-w-[560px] mx-auto text-center px-6 mb-10 sm:mb-12">
						<div className="text-[11px] tracking-wider uppercase opacity-55 mb-3">
							Built so lenders can check it
						</div>
						<h2 className="font-display text-[26px] sm:text-[32px] leading-tight m-0">
							Lenders can&apos;t trust what they can&apos;t trace
						</h2>
					</div>
					<div className="max-w-[1080px] grid gap-5 sm:grid-cols-3 mx-auto px-6">
						{PILLARS.map((p) => (
							<div key={p.title} className="bg-card rounded-3xl p-6 sm:p-7">
								<h3 className="font-display text-[16px] m-0 mb-2">
									{p.title}
								</h3>
								<p className="text-[13.5px] leading-relaxed opacity-70 m-0">
									{p.body}
								</p>
							</div>
						))}
					</div>
				</section>

				<section
					id="your-profile"
					className="max-w-[1080px] mx-auto px-6 py-16 sm:py-24 grid gap-10 sm:gap-14 sm:grid-cols-2 items-center"
				>
					<div>
						<div className="text-[11px] tracking-wider uppercase opacity-55 mb-3">
							Your financial profile
						</div>
						<h2 className="font-display text-[26px] sm:text-[32px] leading-tight m-0 mb-6">
							One clear picture, for you and your lender
						</h2>
						<ul className="list-none p-0 m-0 grid gap-5">
							{LENDER_SEES.map((item) => (
								<li key={item.title} className="flex gap-3">
									<span
										aria-hidden
										className="mt-1.5 w-2 h-2 shrink-0 rounded-full bg-primary"
									/>
									<div>
										<h3 className="font-display text-[16px] m-0 mb-1">
											{item.title}
										</h3>
										<p className="text-[13.5px] leading-relaxed opacity-70 m-0">
											{item.body}
										</p>
									</div>
								</li>
							))}
						</ul>
					</div>
					<LenderSummaryPreview />
				</section>

				<section
					id="questions"
					className="bg-muted border-y border-border py-14 sm:py-20"
				>
					<div className="max-w-[720px] mx-auto px-6">
						<h2 className="font-display text-[26px] sm:text-[32px] leading-tight m-0 mb-8 text-center">
							Questions owners ask
						</h2>
						<div className="grid gap-3">
							{FAQS.map((f) => (
								<details
									key={f.q}
									className="group bg-card border border-border rounded-2xl px-5 py-4"
								>
									<summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-[15.5px] [&::-webkit-details-marker]:hidden">
										{f.q}
										<span
											aria-hidden
											className="text-[20px] leading-none opacity-50 transition-transform group-open:rotate-45"
										>
											+
										</span>
									</summary>
									<p className="text-[14px] leading-relaxed opacity-75 m-0 mt-3">
										{f.a}
									</p>
								</details>
							))}
						</div>
					</div>
				</section>

				<section className="max-w-[640px] mx-auto text-center px-6 py-16 sm:py-20">
					<h2 className="font-display text-[26px] sm:text-[32px] leading-tight m-0 mb-3">
						Know your numbers. Walk in with proof.
					</h2>
					<p className="text-[15px] opacity-75 m-0 mb-7">
						Build your financial profile today and go to your next lender
						meeting with receipts, not charm.
					</p>
					<Link
						href="/signup"
						className="inline-flex items-center justify-center bg-foreground text-background rounded-full px-8 py-3.5 text-[14.5px] font-display"
						style={{ color: "var(--background)" }}
					>
						Get started free
					</Link>
				</section>
			</main>

			<LandingFooter />
		</div>
	);
}

/** An illustrative lender summary, so visitors see what they get. */
function LenderSummaryPreview() {
	const months = [
		{ m: "Jun", in: 62, out: 44 },
		{ m: "Jul", in: 70, out: 47 },
		{ m: "Aug", in: 58, out: 41 },
		{ m: "Sep", in: 78, out: 52 },
		{ m: "Oct", in: 84, out: 55 },
		{ m: "Nov", in: 80, out: 53 },
	];
	return (
		<figure className="m-0 bg-card rounded-3xl shadow-card border border-border p-6 sm:p-7">
			<div className="flex items-start justify-between gap-3 mb-5">
				<div>
					<div className="text-[11px] tracking-wider uppercase opacity-55 mb-1">
						Lender summary
					</div>
					<div className="font-display text-[18px]">Ama&apos;s Provisions</div>
					<div className="text-[12.5px] opacity-60">
						Shop, kiosk or market trading · Kumasi
					</div>
				</div>
				<span className="text-[11px] rounded-full bg-muted border border-border px-2.5 py-1 opacity-70">
					Example
				</span>
			</div>

			<div className="flex items-end gap-2 h-[96px] mb-2" aria-hidden>
				{months.map((x) => (
					<div key={x.m} className="flex-1 flex items-end gap-[3px] h-full">
						<div
							className="flex-1 rounded-t-[4px] bg-primary"
							style={{ height: `${x.in}%` }}
						/>
						<div
							className="flex-1 rounded-t-[4px] bg-foreground/20"
							style={{ height: `${x.out}%` }}
						/>
					</div>
				))}
			</div>
			<div className="flex gap-2 text-[11px] opacity-50 mb-5" aria-hidden>
				{months.map((x) => (
					<div key={x.m} className="flex-1 text-center">
						{x.m}
					</div>
				))}
			</div>

			<dl className="m-0 grid grid-cols-2 gap-3 text-[12.5px] mb-5">
				<div className="bg-muted rounded-xl px-3.5 py-3">
					<dt className="opacity-60 mb-0.5">Average money in</dt>
					<dd className="m-0 font-display text-[16px]">GHS 7,200 / month</dd>
					<dd className="m-0 opacity-55 text-[11.5px] mt-0.5">
						From 6 MoMo statements
					</dd>
				</div>
				<div className="bg-muted rounded-xl px-3.5 py-3">
					<dt className="opacity-60 mb-0.5">Left after costs</dt>
					<dd className="m-0 font-display text-[16px]">GHS 2,350 / month</dd>
					<dd className="m-0 opacity-55 text-[11.5px] mt-0.5">
						Checked against sales book
					</dd>
				</div>
			</dl>

			<div className="text-[12.5px]">
				<div className="opacity-60 mb-1.5">Still missing</div>
				<div className="flex items-center gap-2">
					<span aria-hidden className="w-1.5 h-1.5 rounded-full bg-foreground/40" />
					Rent receipts for August and September
				</div>
			</div>
			<figcaption className="sr-only">
				An example lender summary for a made-up shop, showing monthly money
				in and out, where the numbers came from and what is still missing.
			</figcaption>
		</figure>
	);
}

function LandingFooter() {
	return (
		<footer className="bg-foreground text-background">
			<div className="max-w-[1080px] mx-auto px-6 sm:px-10 py-10 grid gap-8 sm:grid-cols-[1fr_auto]">
				<div>
					<div className="font-display text-[17px] mb-2">OnRecord</div>
					<p className="text-[13px] leading-relaxed opacity-65 m-0 max-w-[380px]">
						A clear financial profile for small businesses in Ghana, so
						owners can understand their business and get financing. OnRecord is not a lender and does not make loan
						decisions.
					</p>
				</div>
				<nav className="flex flex-wrap sm:flex-col gap-x-6 gap-y-2.5 text-[13.5px]">
					<a href="#how-it-works" className="text-background opacity-75 hover:opacity-100">
						How it works
					</a>
					<a href="#your-profile" className="text-background opacity-75 hover:opacity-100">
						Your profile
					</a>
					<a href="#questions" className="text-background opacity-75 hover:opacity-100">
						Questions
					</a>
					<Link href="/signup?mode=login" className="text-background opacity-75 hover:opacity-100">
						Log in
					</Link>
					<Link href="/signup" className="text-background opacity-75 hover:opacity-100">
						Create an account
					</Link>
				</nav>
			</div>
			<div className="max-w-[1080px] mx-auto px-6 sm:px-10 pb-8 text-[12px] opacity-50">
				© {new Date().getFullYear()} OnRecord
			</div>
		</footer>
	);
}

/** Small UI sketches for the three "how it works" cards. Decorative only. */
function StepVisual({ kind }: { kind: "upload" | "profile" | "share" }) {
	return (
		<div
			aria-hidden
			className="mb-6 h-[176px] rounded-2xl bg-muted border border-border p-4 overflow-hidden"
		>
			{kind === "upload" && <UploadSketch />}
			{kind === "profile" && <ProfileSketch />}
			{kind === "share" && <ShareSketch />}
		</div>
	);
}

function FileRow({ name, meta }: { name: string; meta: string }) {
	return (
		<div className="flex items-center gap-2.5 bg-card rounded-xl border border-border px-3 py-1.5">
			<span className="w-6 h-7 shrink-0 rounded-[5px] bg-foreground/10 relative">
				<span className="absolute left-1 right-1 top-2 h-[2px] bg-foreground/25 rounded" />
				<span className="absolute left-1 right-2 top-3.5 h-[2px] bg-foreground/25 rounded" />
			</span>
			<span className="min-w-0 flex-1">
				<span className="block truncate text-[12px] font-semibold">{name}</span>
				<span className="block text-[10.5px] opacity-55">{meta}</span>
			</span>
			<span className="w-4 h-4 shrink-0 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center">
				✓
			</span>
		</div>
	);
}

function UploadSketch() {
	return (
		<div className="grid gap-1.5">
			<FileRow name="MoMo statement, Jun to Nov" meta="PDF · 412 rows read" />
			<FileRow name="Sales book, page 14" meta="Photo · 23 rows read" />
			<FileRow name="Rent receipt" meta="Photo · 1 row read" />
		</div>
	);
}

function ProfileSketch() {
	const bars = [48, 58, 52, 70, 78, 74];
	return (
		<div className="h-full flex flex-col">
			<div className="flex items-baseline justify-between mb-2">
				<span className="text-[10.5px] opacity-60">Money in, per month</span>
				<span className="font-display text-[14px]">GHS 7,200</span>
			</div>
			<div className="flex-1 flex items-end gap-1.5">
				{bars.map((h, i) => (
					<span
						key={i}
						className="flex-1 rounded-t-[4px] bg-primary"
						style={{ height: `${h}%`, opacity: i === bars.length - 1 ? 1 : 0.55 }}
					/>
				))}
			</div>
			<div className="mt-2 inline-flex self-start items-center gap-1.5 rounded-full bg-card border border-border px-2.5 py-1 text-[10.5px]">
				<span className="w-1.5 h-1.5 rounded-full bg-primary" />
				From MoMo statement, page 3
			</div>
		</div>
	);
}

function ShareSketch() {
	return (
		<div className="h-full flex items-center justify-center gap-3">
			<div className="w-[92px] h-[118px] bg-card rounded-lg border border-border shadow-card p-2.5 rotate-[-4deg]">
				<div className="text-[8px] uppercase tracking-wider opacity-55 mb-1">
					Lender summary
				</div>
				<div className="h-1.5 w-12 rounded bg-foreground/70 mb-2" />
				<div className="flex items-end gap-[3px] h-8 mb-2">
					{[40, 55, 50, 70, 80].map((h, i) => (
						<span
							key={i}
							className="flex-1 rounded-t-[2px] bg-primary"
							style={{ height: `${h}%` }}
						/>
					))}
				</div>
				<div className="h-1 w-full rounded bg-foreground/15 mb-1" />
				<div className="h-1 w-3/4 rounded bg-foreground/15 mb-1" />
				<div className="h-1 w-5/6 rounded bg-foreground/15" />
			</div>
			<div className="grid gap-1.5 text-[10.5px]">
				{["Save as PDF", "Send on WhatsApp", "Print"].map((label) => (
					<span
						key={label}
						className="rounded-full bg-card border border-border px-2.5 py-1 whitespace-nowrap"
					>
						{label}
					</span>
				))}
			</div>
		</div>
	);
}
