import Link from "next/link";

export const Footer = () => {
	return (
		<footer className="flex flex-wrap items-center gap-x-5 gap-y-2 px-6 sm:px-10 py-4 bg-foreground text-background">
			<span className="font-display text-sm">OnRecord</span>
			<nav className="ml-auto flex gap-4 text-[12.5px] opacity-80">
				<Link href="/privacy" className="!text-background hover:opacity-100">Privacy</Link>
				<Link href="/terms" className="!text-background hover:opacity-100">Terms</Link>
			</nav>
		</footer>
	);
};
