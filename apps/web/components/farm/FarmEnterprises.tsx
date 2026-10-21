"use client";
import { useState } from "react";
import { farmApi } from "@/lib/farm-api";
import type { Enterprise, FarmType } from "@/lib/farm-types";
import { farmMoney } from "@/lib/farm-money";
import { useFarm } from "./FarmWorkspace";

export function FarmEnterprises() {
	const farm = useFarm();
	const [type, setType] = useState<FarmType>("crop");
	const [cycleEnterprise, setCycleEnterprise] = useState("");
	const [error, setError] = useState("");
	const [pending, setPending] = useState(false);
	const selected =
		farm.enterprises.find((enterprise) => enterprise.id === cycleEnterprise) ?? farm.enterprises[0];
	const submit = async (event: React.FormEvent<HTMLFormElement>, kind: "enterprise" | "cycle") => {
		event.preventDefault();
		const form = event.currentTarget;
		const fields = new FormData(form);
		setPending(true);
		setError("");
		try {
			if (kind === "enterprise") {
				const metadata: Enterprise["metadata_json"] = fields.get("area")
					? {
							area: Number(fields.get("area")),
							area_unit: fields.get("area_unit") as "acres" | "hectares",
						}
					: {};
				const enterprise = await farmApi.createEnterprise(farm.businessId, {
					name: String(fields.get("name")).trim(),
					type,
					subtype: String(fields.get("subtype")),
					region: String(fields.get("region") || "") || null,
					metadata_json: metadata,
				});
				setCycleEnterprise(enterprise.id);
			} else {
				await farmApi.createCycle(farm.businessId, {
					enterprise_id: selected.id,
					name: String(fields.get("name")).trim(),
					start_date: String(fields.get("start_date")),
					end_date: String(fields.get("end_date")) || null,
					expected_harvest_date: String(fields.get("expected_harvest_date") || "") || null,
					stage: fields.get("stage") as "active" | "planned" | "completed",
					metadata_json: {
						...(fields.get("batch_size") ? { batch_size: Number(fields.get("batch_size")) } : {}),
						...(fields.get("pond_count") ? { pond_count: Number(fields.get("pond_count")) } : {}),
					},
				});
			}
			form.reset();
			await farm.refresh();
		} catch (failure) {
			setError(failure instanceof Error ? failure.message : "Could not save. Please retry.");
		} finally {
			setPending(false);
		}
	};
	return (
		<>
			<div className="flex justify-between items-start gap-4 mb-5">
				<div>
					<h2 className="text-xl">Your farm enterprises</h2>
					<p className="text-sm text-muted-foreground mt-2">
						Separate activities, one business financial picture.
					</p>
				</div>
			</div>
			<div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
				{farm.enterprises.map((enterprise) => {
					const totals = farm.report?.enterprises.find((row) => row.key === enterprise.id);
					const cycles = farm.cycles.filter((cycle) => cycle.enterprise_id === enterprise.id);
					return (
						<article className="farm-card" key={enterprise.id}>
							<p className="farm-eyebrow">
								{enterprise.type} · {enterprise.subtype}
							</p>
							<h3 className="text-lg mt-2">{enterprise.name}</h3>
							<p className="text-xs text-muted-foreground mt-2">
								{enterprise.region || "Region not recorded"}
								{enterprise.metadata_json.area
									? ` · ${enterprise.metadata_json.area} ${enterprise.metadata_json.area_unit}`
									: ""}
							</p>
							<div className="mt-5 pt-4 border-t border-border text-sm">
								<p>
									Recorded surplus{" "}
									<b className="float-right tabular-nums">
										{totals ? farmMoney(totals.surplus_pesewas) : "No activity in this scope"}
									</b>
								</p>
								<p className="text-xs text-muted-foreground mt-2">
									Shared overhead excluded. Selected reporting period applies.
								</p>
							</div>
							<ul className="mt-4 text-xs space-y-2">
								{cycles.map((cycle) => (
									<li key={cycle.id}>
										<b>{cycle.name}</b> · {cycle.stage}
										<span className="block text-muted-foreground mt-1">
											{cycle.start_date} to {cycle.end_date ?? "ongoing"}
											{cycle.metadata_json.batch_size
												? ` · ${cycle.metadata_json.batch_size} animals / fish`
												: ""}
											{cycle.metadata_json.pond_count
												? ` · ${cycle.metadata_json.pond_count} ponds`
												: ""}
										</span>
									</li>
								))}
							</ul>
						</article>
					);
				})}
			</div>
			{error && (
				<p role="alert" className="farm-notice mb-4">
					{error}
				</p>
			)}
			<div className="farm-two-col">
				<form className="farm-card" onSubmit={(event) => submit(event, "enterprise")}>
					<h3 className="text-lg mb-5">Add an enterprise</h3>
					<div className="farm-form-grid">
						<label>
							Enterprise name
							<input name="name" required maxLength={120} placeholder="e.g. North field maize" />
						</label>
						<label>
							Enterprise type
							<select value={type} onChange={(event) => setType(event.target.value as FarmType)}>
								<option value="crop">Crop farming</option>
								<option value="livestock">Poultry / livestock</option>
								<option value="aquaculture">Aquaculture</option>
							</select>
						</label>
						<label>
							Crop / animal / fish
							<select name="subtype" key={type}>
								{farm.options?.templates[type].subtypes.map((name) => (
									<option key={name}>{name}</option>
								))}
							</select>
						</label>
						<label>
							Region
							<input name="region" maxLength={100} placeholder="e.g. Ashanti" />
						</label>
						{type === "crop" && (
							<>
								<label>
									Farm area (optional)
									<input name="area" type="number" min="0.0001" max="1000000" step="0.0001" />
								</label>
								<label>
									Area unit
									<select name="area_unit">
										<option value="acres">Acres</option>
										<option value="hectares">Hectares</option>
									</select>
								</label>
							</>
						)}
					</div>
					<button className="farm-button mt-5" disabled={pending || !farm.options}>
						{pending ? "Saving…" : "Add enterprise"}
					</button>
				</form>
				<form className="farm-card" onSubmit={(event) => submit(event, "cycle")}>
					<h3 className="text-lg mb-5">Open a season / batch</h3>
					{!selected ? (
						<p className="text-sm text-muted-foreground">Add an enterprise first.</p>
					) : (
						<>
							<div className="farm-form-grid">
								<label>
									Enterprise
									<select
										value={selected.id}
										onChange={(event) => setCycleEnterprise(event.target.value)}
									>
										{farm.enterprises.map((enterprise) => (
											<option value={enterprise.id} key={enterprise.id}>
												{enterprise.name}
											</option>
										))}
									</select>
								</label>
								<label>
									Season / batch name
									<input
										name="name"
										required
										maxLength={120}
										placeholder={selected.type === "crop" ? "2026 main season" : "2026 batch 01"}
									/>
								</label>
								<label>
									Start / stocking date
									<input name="start_date" type="date" required />
								</label>
								<label>
									End / harvest date (optional)
									<input name="end_date" type="date" />
								</label>
								<label>
									Stage
									<select name="stage">
										<option value="active">Active</option>
										<option value="planned">Planned</option>
										<option value="completed">Completed</option>
									</select>
								</label>
								{selected.type === "crop" && (
									<label>
										Expected harvest (optional)
										<input name="expected_harvest_date" type="date" />
									</label>
								)}
								{selected.type !== "crop" && (
									<label>
										Batch size (optional)
										<input name="batch_size" type="number" min="1" max="10000000" step="1" />
									</label>
								)}
								{selected.type === "aquaculture" && (
									<label>
										Ponds / cages (optional)
										<input name="pond_count" type="number" min="1" max="100000" step="1" />
									</label>
								)}
							</div>
							<button className="farm-button mt-5" disabled={pending}>
								{pending ? "Saving…" : "Create production cycle"}
							</button>
						</>
					)}
				</form>
			</div>
		</>
	);
}
