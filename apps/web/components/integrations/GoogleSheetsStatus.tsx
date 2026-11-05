"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { connectGoogleSheets } from "@/lib/google-sheets-connect";

export function GoogleSheetsStatus() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/integrations/google-sheets/status")
      .then(async (response) => ({ response, data: (await response.json()) as { connected?: boolean; error?: string } }))
      .then(({ response, data }) => {
        if (!response.ok) return setError(data.error ?? "Could not check the Google connection.");
        setConnected(Boolean(data.connected));
      })
      .catch(() => setError("Could not check the Google connection."));
  }, []);

  async function connect() {
    const problem = await connectGoogleSheets();
    if (problem) setError(problem);
  }

  if (error) return <span className="text-[11px] text-destructive text-right max-w-[180px]">{error}</span>;
  if (connected === null) return <span className="text-[12px] opacity-60">Checking connection...</span>;
  if (connected) {
    return (
      <div className="flex items-center gap-2">
        <Badge tone="positive">Connected</Badge>
        <Link href="/documents" className="text-[12px] underline underline-offset-2">Import data</Link>
        <button type="button" onClick={() => void connect()} className="text-[12px] opacity-70 underline underline-offset-2">Reconnect</button>
      </div>
    );
  }
  return <button type="button" onClick={() => void connect()} className="shrink-0 bg-foreground text-background text-[13px] px-4.5 py-2.5 rounded-full">Connect</button>;
}
