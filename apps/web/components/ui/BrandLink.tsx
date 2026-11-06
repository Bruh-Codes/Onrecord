import Image from "next/image";
import Link from "next/link";
import icon from "@/public/icon.png";
import iconDark from "@/public/icon-dark.png";

/** The OnRecord logo (icon + name) linking home, as on the landing page. */
export function BrandLink() {
	return (
		<Link href="/" className="inline-flex items-center gap-2 no-underline hover:opacity-100">
			<Image src={iconDark} alt="OnRecord" width={28} height={28} className="dark:hidden" />
			<Image src={icon} alt="" width={28} height={28} className="hidden dark:block" />
			<span className="font-display text-[19px]">OnRecord</span>
		</Link>
	);
}
