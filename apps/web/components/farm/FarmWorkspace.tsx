"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMe } from "@/lib/hooks/use-business";
import { farmApi } from "@/lib/farm-api";
import type { Business } from "@/lib/api-types";
import type { Cycle, Enterprise, FarmFilters, FarmOptions, FarmReport } from "@/lib/farm-types";
import { FarmBusinessForm } from "./FarmBusinessForm";

type Workspace = {
	businessId: string;
	business?: Business;
	enterprises: Enterprise[];
	cycles: Cycle[];
	options?: FarmOptions;
	filters: FarmFilters;
	setFilters: (value: FarmFilters) => void;
	report?: FarmReport;
	loading: boolean;
	error: string | null;
	refresh: () => Promise<void>;
};
const Context = createContext<Workspace | null>(null);
export function useFarm() {
	const context = useContext(Context);
	if (!context) throw new Error("Farm workspace required.");
	return context;
}
const tabs = [
	["/farm", "Overview"],
	["/farm/enterprises", "Enterprises"],
	["/farm/transactions", "Transactions"],
	["/farm/insights", "Insights"],
	["/farm/report", "Finance report"],
];

export function FarmWorkspace({ children }: { children: React.ReactNode }) {
	const path = usePathname();
	const qc = useQueryClient();
	const me = useMe();
	const userId = me.data?.user_id ?? "";
	const businesses = useQuery({
		queryKey: ["farm-businesses", userId],
		queryFn: farmApi.businesses,
		enabled: !!userId,
	});
	const options = useQuery({ queryKey: ["farm-options"], queryFn: farmApi.options });
	const [selection, setSelection] = useState<{
		userId: string;
		id: string;
		filters: FarmFilters;
	} | null>(null);
	const [scopeOpen, setScopeOpen] = useState(false);
	const activeSelection = selection?.userId === userId ? selection : null;
	const businessId = activeSelection?.id ?? me.businessId ?? businesses.data?.[0]?.id ?? "";
	const filters = useMemo(
		() => (activeSelection?.id === businessId ? activeSelection.filters : {}),
		[activeSelection, businessId],
	);
	const enterprises = useQuery({
		queryKey: ["farm-enterprises", businessId],
		queryFn: () => farmApi.enterprises(businessId),
		enabled: !!businessId,
	});
	const cycles = useQuery({
		queryKey: ["farm-cycles", businessId],
		queryFn: () => farmApi.cycles(businessId),
		enabled: !!businessId,
	});
	const report = useQuery({
		queryKey: ["farm-report", businessId, filters],
		queryFn: () => farmApi.report(businessId, filters),
		enabled: !!businessId,
	});
	const refresh = async () => {
		await qc.invalidateQueries({
			predicate: (query) => String(query.queryKey[0]).startsWith("farm-"),
		});
	};
	const select = useMutation({
		mutationFn: async (id: string) => {
			await farmApi.selectBusiness(id);
			return id;
		},
		onSuccess: async (id) => {
			setSelection({ userId, id, filters: {} });
			await qc.invalidateQueries({ queryKey: ["me"] });
		},
	});
	const demo = useMutation({
		mutationFn: async () => {
			const result = await farmApi.demo();
			const yaw = result.items[0];
			await farmApi.selectBusiness(yaw.id);
			return yaw.id;
		},
		onSuccess: async (id) => {
			setSelection({ userId, id, filters: {} });
			await refresh();
			await qc.invalidateQueries({ queryKey: ["me"] });
		},
	});
	const failure = [
		me.error,
		businesses.error,
		options.error,
		enterprises.error,
		cycles.error,
		report.error,
		select.error,
		demo.error,
	].find(Boolean);
	const value: Workspace = {
		businessId,
		business: businesses.data?.find((row) => row.id === businessId),
		enterprises: enterprises.data ?? [],
		cycles: cycles.data ?? [],
		options: options.data,
		filters,
		setFilters: (next) => setSelection({ userId, id: businessId, filters: next }),
		report: report.data,
		loading:
			me.isLoading ||
			businesses.isLoading ||
			enterprises.isLoading ||
			cycles.isLoading ||
			report.isLoading ||
			select.isPending,
		error: failure?.message ?? null,
		refresh,
	};
	return (
		<Context.Provider value={value}>
			<main className="farm-workspace px-4 sm:px-7 pt-6 pb-12 max-w-[1440px] mx-auto">
				<div className="farm-no-print">
					<div className="flex flex-wrap items-start justify-between gap-4 mb-6">
						<div>
							<p className="farm-eyebrow">Agricultural finance workspace</p>
							<h1 className="text-2xl sm:text-3xl mt-1">
								<span className="sm:hidden">Farm finances</span>
								<span className="hidden sm:inline">A clearer record for every season.</span>
							</h1>
							<p className="hidden sm:block text-sm text-muted-foreground mt-2">
								Your farm activity, supporting records, and financial story in one place.
							</p>
						</div>
						{options.data?.demo_enabled && (
							<button
								className="farm-button secondary"
								disabled={demo.isPending}
								onClick={() => demo.mutate()}
							>
								{demo.isPending ? "Preparing fictional records…" : "Try Yaw’s tomato demo"}
							</button>
						)}
					</div>
					<div className="farm-card mb-5">
						<button
							type="button"
							className="farm-scope-toggle"
							aria-expanded={scopeOpen}
							aria-controls="farm-scope-controls"
							onClick={() => setScopeOpen(!scopeOpen)}
						>
							<span>
								<b>{value.business?.legal_name ?? "Reporting scope"}</b>
								<span className="block text-xs text-muted-foreground mt-1">
									{filters.enterprise_id
										? value.enterprises.find((row) => row.id === filters.enterprise_id)?.name
										: "All enterprises"}{" "}
									· {filters.from || filters.to ? "Custom period" : "All recorded dates"}
								</span>
							</span>
							<span>{scopeOpen ? "Close" : "Change"}</span>
						</button>
						<div
							id="farm-scope-controls"
							className={`farm-scope-controls${scopeOpen ? " open" : ""}`}
						>
							<div className="farm-form-grid">
								<label>
									Business
									<select
										aria-label="Business"
										value={businessId}
										disabled={select.isPending}
										onChange={(event) => select.mutate(event.target.value)}
									>
										<option value="" disabled>
											Select your business
										</option>
										{businesses.data?.map((business) => (
											<option key={business.id} value={business.id}>
												{business.is_demo ? "Demo · " : ""}
												{business.legal_name}
											</option>
										))}
									</select>
								</label>
								<label>
									Enterprise
									<select
										value={filters.enterprise_id ?? ""}
										onChange={(event) =>
											value.setFilters({
												...filters,
												enterprise_id: event.target.value || undefined,
												cycle_id: undefined,
											})
										}
									>
										<option value="">All enterprises + shared overhead</option>
										{value.enterprises.map((enterprise) => (
											<option key={enterprise.id} value={enterprise.id}>
												{enterprise.name}
											</option>
										))}
									</select>
								</label>
								<label>
									Season / batch
									<select
										value={filters.cycle_id ?? ""}
										onChange={(event) => {
											const cycle = value.cycles.find((row) => row.id === event.target.value);
											value.setFilters({
												...filters,
												cycle_id: cycle?.id,
												enterprise_id: cycle?.enterprise_id ?? filters.enterprise_id,
											});
										}}
									>
										<option value="">All production cycles</option>
										{value.cycles
											.filter(
												(row) =>
													!filters.enterprise_id || row.enterprise_id === filters.enterprise_id,
											)
											.map((cycle) => (
												<option key={cycle.id} value={cycle.id}>
													{cycle.name}
												</option>
											))}
									</select>
								</label>
								<label>
									From
									<input
										type="date"
										value={filters.from ?? ""}
										onChange={(event) =>
											value.setFilters({ ...filters, from: event.target.value || undefined })
										}
									/>
								</label>
								<label>
									To
									<input
										type="date"
										value={filters.to ?? ""}
										onChange={(event) =>
											value.setFilters({ ...filters, to: event.target.value || undefined })
										}
									/>
								</label>
							</div>
							<FarmBusinessForm onCreated={(id) => select.mutate(id)} />
						</div>
					</div>
					{value.business?.is_demo && (
						<div className="farm-notice mb-5">
							<b>Fictional demonstration.</b> These sample farms and amounts are illustrative. No
							bank connection or verified evidence. Demo records belong to separate businesses and
							never enter your real business totals.
						</div>
					)}
					<nav className="farm-tabs" aria-label="Farm workspace">
						{tabs.map(([href, label]) => (
							<Link key={href} href={href} aria-current={path === href ? "page" : undefined}>
								{label}
							</Link>
						))}
					</nav>
					{value.error && (
						<div role="alert" className="farm-notice mb-5">
							{value.error}{" "}
							<button className="underline" onClick={() => refresh()}>
								Retry
							</button>
						</div>
					)}
				</div>
				{value.loading ? (
					<p role="status" className="farm-card">
						Loading farm records…
					</p>
				) : !businessId ? (
					<p className="farm-card">Create or select a business to begin.</p>
				) : (
					children
				)}
			</main>
		</Context.Provider>
	);
}
