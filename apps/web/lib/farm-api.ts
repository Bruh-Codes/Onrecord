import { request } from "./api";
import type { Business } from "./api-types";
import type {
	Cycle,
	DemoResult,
	Enterprise,
	EntryWrite,
	FarmEntry,
	FarmFilters,
	FarmOptions,
	FarmReport,
	Page,
} from "./farm-types";

const base = (id: string) => `/v1/businesses/${id}/farm`;
const query = (params: Record<string, string | number | undefined> = {}) => {
	const values = Object.entries(params).filter(([, value]) => value !== undefined && value !== "");
	return `?${new URLSearchParams(values.map(([key, value]) => [key, String(value)]))}`;
};
const post = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });

async function all<T>(path: string): Promise<T[]> {
	const items: T[] = [];
	for (let page = 1; ; page++) {
		const result = await request<Page<T>>(`${path}${query({ page, page_size: 200 })}`);
		items.push(...result.items);
		if (items.length >= result.total || !result.items.length) return items;
	}
}

export const farmApi = {
	businesses: () => all<Business>("/v1/businesses"),
	selectBusiness: (id: string) =>
		request<Business>(`/v1/businesses/${id}/select`, { method: "POST" }),
	options: () => request<FarmOptions>("/v1/agriculture/options"),
	demo: () => request<DemoResult>("/v1/agriculture/demo", { method: "POST" }),
	enterprises: (id: string) => all<Enterprise>(`${base(id)}/enterprises`),
	createEnterprise: (id: string, body: Omit<Enterprise, "id" | "business_id">) =>
		request<Enterprise>(`${base(id)}/enterprises`, post(body)),
	cycles: (id: string) => all<Cycle>(`${base(id)}/cycles`),
	createCycle: (id: string, body: Omit<Cycle, "id" | "business_id">) =>
		request<Cycle>(`${base(id)}/cycles`, post(body)),
	entries: (id: string, filters: FarmFilters, page = 1) =>
		request<Page<FarmEntry>>(`${base(id)}/entries${query({ ...filters, page, page_size: 25 })}`),
	createEntry: (id: string, body: EntryWrite) =>
		request<FarmEntry>(`${base(id)}/entries`, post(body)),
	updateEntry: (id: string, entry: string, body: EntryWrite) =>
		request<FarmEntry>(`${base(id)}/entries/${entry}`, {
			method: "PUT",
			body: JSON.stringify(body),
		}),
	deleteEntry: (id: string, entry: string) =>
		request<void>(`${base(id)}/entries/${entry}`, { method: "DELETE" }),
	report: (id: string, filters: FarmFilters) =>
		request<FarmReport>(`${base(id)}/report${query(filters)}`),
};
