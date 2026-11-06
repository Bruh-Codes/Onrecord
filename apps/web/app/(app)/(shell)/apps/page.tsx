import { Badge } from "@/components/ui/Badge";
import { GoogleSheetsCard } from "@/components/integrations/GoogleSheetsCard";
import { IntegrationLogo } from "@/components/integrations/logos";
import { PaystackCard } from "@/components/integrations/PaystackCard";
import { APP_INTEGRATIONS, LIVE_INTEGRATIONS, type AppIntegration } from "@/lib/integrations";

function CardHeader({ app }: { app: AppIntegration }) {
	return (
		<>
			<IntegrationLogo icon={app.icon} />
			<div className="flex-1 min-w-0">
				<div className="text-[15px] font-semibold mb-0.5">{app.name}</div>
				<div className="text-[12.5px] opacity-65">{app.desc}</div>
			</div>
		</>
	);
}

export default function IntegrationsPage() {
	const live = APP_INTEGRATIONS.filter((app) => LIVE_INTEGRATIONS.includes(app.icon));
	const soon = APP_INTEGRATIONS.filter((app) => !LIVE_INTEGRATIONS.includes(app.icon));
	return (
		<div className="flex-1 min-w-0 px-4 sm:px-7 pt-6 sm:pt-7.5 pb-10 max-w-[860px]">
			<h1 className="text-[24px] sm:text-[28px] m-0 mb-1.5">Integrations</h1>
			<p className="text-sm opacity-70 m-0 mb-6.5">Connect once and OnRecord keeps your records up to date by itself.</p>

			<div className="flex flex-col gap-3.5">
				{live.map((app) =>
					app.icon === "paystack" ? (
						<PaystackCard key={app.name} header={<CardHeader app={app} />} />
					) : (
						<GoogleSheetsCard key={app.name} header={<CardHeader app={app} />} />
					),
				)}
			</div>

			<h2 className="m-0 mt-9 mb-3 text-[13px] font-semibold uppercase tracking-wide opacity-60">Coming soon</h2>
			<div className="grid gap-3 sm:grid-cols-2">
				{soon.map((app) => (
					<div key={app.name} className="flex flex-col gap-3 rounded-2xl border border-foreground/12 p-4.5">
						<div className="flex items-start justify-between gap-3">
							<IntegrationLogo icon={app.icon} />
							<Badge tone="neutral">Soon</Badge>
						</div>
						<div>
							<div className="text-[15px] font-semibold mb-0.5">{app.name}</div>
							<div className="text-[12.5px] opacity-65">{app.desc}</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
