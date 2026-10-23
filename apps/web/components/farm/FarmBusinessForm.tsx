"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

export function FarmBusinessForm({ onCreated }: { onCreated: (id: string) => void }) {
	const [error, setError] = useState("");
	const [pending, setPending] = useState(false);
	const qc = useQueryClient();
	return (
		<details className="mt-4">
			<summary className="cursor-pointer text-sm text-primary font-semibold">
				+ Add an agricultural business
			</summary>
			<form
				className="mt-4"
				onSubmit={async (event) => {
					event.preventDefault();
					const form = event.currentTarget;
					const fields = new FormData(form);
					setPending(true);
					setError("");
					try {
						const business = await api.createBusiness({
							legal_name: String(fields.get("name")).trim(),
							region: fields.get("region"),
							entity_type: fields.get("entity_type"),
						});
						await qc.invalidateQueries({ queryKey: ["farm-businesses"] });
						onCreated(business.id);
						form.reset();
					} catch (failure) {
						setError(failure instanceof Error ? failure.message : "Could not create business.");
					} finally {
						setPending(false);
					}
				}}
			>
				<div className="farm-form-grid">
					<label>
						Business / farm name
						<input name="name" required maxLength={120} placeholder="e.g. Mensah Family Farms" />
					</label>
					<label>
						Region
						<input name="region" required maxLength={100} placeholder="e.g. Greater Accra" />
					</label>
					<label>
						Business type
						<select name="entity_type">
							<option value="sole_prop">Sole proprietorship</option>
							<option value="partnership">Partnership</option>
							<option value="ltd">Limited company</option>
							<option value="ngo">NGO</option>
						</select>
					</label>
				</div>
				{error && (
					<p role="alert" className="text-destructive mt-3">
						{error}
					</p>
				)}
				<button className="farm-button mt-4" disabled={pending}>
					{pending ? "Creating…" : "Create business"}
				</button>
			</form>
		</details>
	);
}
