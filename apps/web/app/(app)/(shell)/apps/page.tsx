import { Badge } from "@/components/ui/Badge";
import { AppsIcon, GoogleSheetsLogo } from "@/components/icons";
import { GoogleSheetsCard } from "@/components/integrations/GoogleSheetsCard";
import { APP_INTEGRATIONS } from "@/lib/integrations";

export default function IntegrationsPage() {
	return (
		<div className="flex-1 min-w-0 px-4 sm:px-7 pt-6 sm:pt-7.5 pb-10 max-w-[820px]">
			<h1 className="text-[24px] sm:text-[28px] m-0 mb-1.5">Integrations</h1>
			<p className="text-sm opacity-70 m-0 mb-6.5">Connect once and OnRecord keeps your records up to date by itself.</p>
			<div className="flex flex-col gap-3.5">
				{APP_INTEGRATIONS.map((app) => {
					const header = (
						<>
							<div className="w-11 h-11 shrink-0 rounded-xl bg-muted flex items-center justify-center">
								{app.icon === "google-sheets" ? <GoogleSheetsLogo /> : <AppsIcon />}
							</div>
							<div className="flex-1 min-w-0">
								<div className="text-[15px] font-semibold mb-0.5">{app.name}</div>
								<div className="text-[12.5px] opacity-65">{app.desc}</div>
							</div>
						</>
					);
					if (app.icon === "google-sheets") return <GoogleSheetsCard key={app.name} header={header} />;
					return (
						<div key={app.name} className="flex items-center gap-4 p-5 border border-foreground/12 rounded-2xl opacity-75 hover:opacity-100 transition-opacity">
							{header}
							<Badge tone="neutral">Coming soon</Badge>
						</div>
					);
				})}
			</div>
		</div>
	);
}
