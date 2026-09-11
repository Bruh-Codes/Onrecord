import { Badge } from "@/components/ui/Badge";
import { AppsIcon } from "@/components/icons";
import { APP_INTEGRATIONS } from "@/lib/mock-data";

export default function IntegrationsPage() {
	return (
		<div className="flex-1 min-w-0 px-4 sm:px-7 pt-6 sm:pt-7.5 pb-10 max-w-[820px]">
			<h1 className="text-[24px] sm:text-[28px] m-0 mb-1.5">Integrations</h1>
			<p className="text-sm opacity-70 m-0 mb-6.5">
				Connect other services to feed your profile automatically. Nothing here
				changes what&apos;s already uploaded.
			</p>
			<div className="flex flex-col gap-3.5">
				{APP_INTEGRATIONS.map((app) => (
					<div
						key={app.name}
						className="flex items-center gap-4 p-5 border border-foreground/12 rounded-2xl opacity-75 hover:opacity-100 transition-opacity"
					>
						<div className="w-11 h-11 shrink-0 rounded-xl bg-muted flex items-center justify-center">
							<AppsIcon />
						</div>
						<div className="flex-1 min-w-0">
							<div className="text-[15px] font-semibold mb-0.5">{app.name}</div>
							<div className="text-[12.5px] opacity-65">{app.desc}</div>
						</div>
						<Badge tone="neutral">Coming soon</Badge>
						<button
							type="button"
							disabled
							className="shrink-0 bg-foreground/5 opacity-20 text-[13px] px-4.5 py-2.5 border-none rounded-full cursor-not-allowed"
						>
							Connect
						</button>
					</div>
				))}
			</div>
		</div>
	);
}
