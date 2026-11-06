"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { SheetConnections } from "@/components/integrations/SheetConnections";
import { connectGoogleSheets } from "@/lib/google-sheets-connect";

/** The Google Sheets card: connect Google, then pick a sheet right here. */
export function GoogleSheetsCard({ header }: { header: ReactNode }) {
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
    const problem = await connectGoogleSheets("/apps");
    if (problem) setError(problem);
  }

  let action: ReactNode;
  if (error) action = <span className="text-[11px] text-destructive text-right max-w-[180px]">{error}</span>;
  else if (connected === null) action = <span className="text-[12px] opacity-60">Checking…</span>;
  else if (connected) {
    action = (
      <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
        <Badge tone="positive">Connected</Badge>
        <div className="flex gap-2">
          <Link href="/documents" className="text-[12px] opacity-70 underline underline-offset-2">Import data</Link>
          <button type="button" onClick={() => void connect()} className="text-[12px] opacity-70 underline underline-offset-2">Reconnect</button>
        </div>
      </div>
    );
  } else {
    action = <button type="button" onClick={() => void connect()} className="shrink-0 bg-foreground text-background text-[13px] px-4.5 py-2.5 rounded-full">Connect</button>;
  }

  return (
    <div className="flex flex-col gap-4 p-5 border border-foreground/12 rounded-2xl">
      <div className="flex items-center gap-4">
        {header}
        {action}
      </div>
      {connected ? <SheetConnections /> : null}
    </div>
  );
}
