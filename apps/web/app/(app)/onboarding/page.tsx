"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMe } from "@/lib/hooks/use-business";

const ENTITY_TYPES = [
  { value: "sole_prop", label: "Sole proprietorship" },
  { value: "partnership", label: "Partnership" },
  { value: "ltd", label: "Limited liability company" },
  { value: "ngo", label: "NGO" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { isLoading } = useMe();
  const [legalName, setLegalName] = useState("");
  const [tradingName, setTradingName] = useState("");
  const [entityType, setEntityType] = useState("sole_prop");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm opacity-60">Loading…</div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const business = await api.createBusiness({
        legal_name: legalName.trim(),
        trading_name: tradingName.trim() || null,
        entity_type: entityType,
      });
      qc.invalidateQueries({ queryKey: ["me"] });
      router.push(business.id ? `/overview?created=1` : "/overview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create your business.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-[430px]">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <span className="w-[26px] h-[26px] rounded-lg bg-ink inline-block" />
          <span className="font-[family-name:var(--font-display)] text-lg">Onrecord</span>
        </div>
        <h1 className="text-[26px] m-0 mb-1.5">Tell us about your business</h1>
        <p className="text-sm opacity-70 m-0 mb-7">
          We use this to build your readiness profile. You can add more detail later.
        </p>

        <form onSubmit={submit} className="flex flex-col gap-4.5">
          <label className="flex flex-col gap-1.5 text-[13px]">
            Legal name
            <input
              required
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="e.g. Adom Ventures Ltd"
              className="border border-border rounded-xl px-4 py-3 text-[14px] bg-transparent outline-none focus:border-ink"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px]">
            Trading name (optional)
            <input
              value={tradingName}
              onChange={(e) => setTradingName(e.target.value)}
              placeholder="e.g. Adom"
              className="border border-border rounded-xl px-4 py-3 text-[14px] bg-transparent outline-none focus:border-ink"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px]">
            Entity type
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="border border-border rounded-xl px-4 py-3 text-[14px] bg-transparent outline-none focus:border-ink"
            >
              {ENTITY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          {error && <div className="text-[13px] text-negative">{error}</div>}

          <button
            type="submit"
            disabled={saving}
            className="mt-2 bg-ink text-paper font-[family-name:var(--font-display)] text-sm px-6 py-3 border-none rounded-full cursor-pointer disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create my profile"}
          </button>
        </form>
      </div>
    </div>
  );
}