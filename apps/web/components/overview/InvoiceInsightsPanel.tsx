import type { InvoiceInsightItem, InvoiceInsights } from "@/lib/api-types";

function formatAmount(value: number | null, currency: string | null) {
	if (value == null) return "—";
	const amount = value / 100;
	const symbol = currency === "GHS" ? "GH¢" : currency ? `${currency} ` : "";
	return `${symbol}${amount.toLocaleString("en-GH", { maximumFractionDigits: amount % 1 === 0 ? 0 : 2 })}`;
}

function InvoiceRow({ item }: { item: InvoiceInsightItem }) {
	return (
		<div className="flex flex-wrap items-center gap-3 border-b border-border/60 py-3 text-sm">
			<div className="min-w-[170px] flex-1">
				<div className="font-semibold">{item.supplier ?? item.filename}</div>
				<div className="text-xs text-ink/55">
					{item.invoice_number ?? "Invoice reference unavailable"} · {item.kind === "issued" ? "Issued" : "Received"}
				</div>
			</div>
			<div className="text-right">
				<div className="font-semibold">{formatAmount(item.total_pesewas, item.currency)}</div>
				<div className="text-xs text-ink/55">{item.payment_status ?? "Status unavailable"}</div>
			</div>
		</div>
	);
}

export function InvoiceInsightsPanel({ data }: { data: InvoiceInsights | undefined }) {
	if (!data || data.total_documents === 0) {
		return <div className="rounded-xl border border-border/70 p-5 text-sm text-ink/60">No invoice documents have been extracted yet.</div>;
	}

	return (
		<section className="mb-12">
			<div className="grid gap-5 mb-5 grid-cols-1 md:grid-cols-3">
				<div className="rounded-xl border border-border/70 p-4">
					<div className="text-[12px] uppercase text-ink/50">Issued invoices</div>
					<div className="text-[24px] mt-2">{data.issued_count.toLocaleString()}</div>
				</div>
				<div className="rounded-xl border border-border/70 p-4">
					<div className="text-[12px] uppercase text-ink/50">Received bills</div>
					<div className="text-[24px] mt-2">{data.received_count.toLocaleString()}</div>
				</div>
				<div className="rounded-xl border border-border/70 p-4">
					<div className="text-[12px] uppercase text-ink/50">Currencies</div>
					<div className="text-[24px] mt-2">{Object.keys(data.totals_by_currency).length.toLocaleString()}</div>
				</div>
			</div>
			<div className="rounded-xl border border-border/70 px-4">
				<div className="py-3 text-xs tracking-wider uppercase text-ink/45">Invoice evidence</div>
				{data.items.map((item) => <InvoiceRow key={item.document_id} item={item} />)}
			</div>
			<p className="mt-3 mb-0 text-xs text-ink/55">Invoice totals represent amounts billed or received as documents. They are not added to cashflow until matched to a bank or MoMo transaction.</p>
		</section>
	);
}
