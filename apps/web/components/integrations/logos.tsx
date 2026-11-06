import { Bank } from "@phosphor-icons/react/dist/ssr";
import type { AppIntegration } from "@/lib/integrations";

/** Product marks for the Integrations page, in each brand's own colours. */

function GoogleSheets() {
	return (
		<svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
			<path fill="#0F9D58" d="M5 2h9l5 5v15H5z" />
			<path fill="#87CEAC" d="M14 2v5h5z" />
			<path fill="#fff" d="M8 10h8v1.5H8zM8 13h8v1.5H8zM8 16h8v1.5H8z" />
			<path fill="#fff" d="M8 10v7.5h1.5V10zM11.25 10v7.5h1.5V10z" />
		</svg>
	);
}

/** Paystack's stacked-bars mark (from Paystack's own brand asset). */
function Paystack() {
	return (
		<svg viewBox="200 196 426 418" className="h-6 w-6" aria-hidden="true">
			<g fill="#0BA4DB">
				<rect x="202" y="199" width="399" height="84" rx="22" />
				<rect x="202" y="309" width="422" height="84" rx="22" />
				<rect x="202" y="419" width="399" height="84" rx="22" />
				<rect x="202" y="529" width="244" height="84" rx="22" />
			</g>
		</svg>
	);
}

/** MTN: black oval and lettering on MTN yellow. */
function Mtn() {
	return (
		<svg viewBox="0 0 48 48" className="h-11 w-11" aria-hidden="true">
			<rect width="48" height="48" rx="12" fill="#FFCB05" />
			<ellipse cx="24" cy="24" rx="18.5" ry="11.5" fill="none" stroke="#000" strokeWidth="2.6" />
			<text x="24" y="28.4" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="900" fontSize="12.5" fill="#000">MTN</text>
		</svg>
	);
}

function Gmail() {
	return (
		<svg viewBox="0 0 256 193" className="h-6 w-7" aria-hidden="true">
			<path fill="#4285f4" d="M58.182 192.05V93.14L27.507 65.077L0 49.504v125.091c0 9.658 7.825 17.455 17.455 17.455z" />
			<path fill="#34a853" d="M197.818 192.05h40.727c9.659 0 17.455-7.826 17.455-17.455V49.505l-31.156 17.837l-27.026 25.798z" />
			<path fill="#ea4335" d="m58.182 93.14l-4.174-38.647l4.174-36.989L128 69.868l69.818-52.364l4.669 34.992l-4.669 40.644L128 145.504z" />
			<path fill="#fbbc04" d="M197.818 17.504V93.14L256 49.504V26.231c0-21.585-24.64-33.89-41.89-20.945z" />
			<path fill="#c5221f" d="m0 49.504l26.759 20.07L58.182 93.14V17.504L41.89 5.286C24.61-7.66 0 4.646 0 26.23z" />
		</svg>
	);
}

/** A tile that holds a product mark. MTN fills its own yellow tile. */
export function IntegrationLogo({ icon }: { icon: AppIntegration["icon"] }) {
	if (icon === "mtn") return <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl"><Mtn /></div>;
	return (
		<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-foreground/10 bg-white">
			{icon === "google-sheets" ? <GoogleSheets /> : null}
			{icon === "paystack" ? <Paystack /> : null}
			{icon === "gmail" ? <Gmail /> : null}
			{icon === "bank" ? <Bank size={24} weight="duotone" className="text-neutral-700" /> : null}
		</div>
	);
}
