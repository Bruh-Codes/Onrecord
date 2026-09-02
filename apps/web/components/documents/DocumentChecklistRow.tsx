"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { PillButton } from "@/components/ui/PillButton";
import { DocumentsIcon } from "@/components/icons";
import type { DocumentItem } from "@/lib/types";

export function DocumentChecklistRow({
  doc,
  onResolve,
}: {
  doc: DocumentItem;
  onResolve: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const statusLabel = doc.static ? (doc.done ? "Received" : "Skipped") : doc.done ? "Received" : "Missing";
  const tone = doc.static ? "neutral" : doc.done ? "positive" : "negative";

  return (
    <div className="py-4 border-b border-border">
      <div className="flex items-center gap-3.5">
        <div className="w-[38px] h-[38px] shrink-0 rounded-[10px] bg-panel flex items-center justify-center">
          <DocumentsIcon />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">{doc.label}</div>
          <div className="text-xs opacity-60">{doc.detail}</div>
        </div>
        <Badge tone={tone}>{statusLabel}</Badge>
        {!doc.done && doc.actionLabel && <PillButton onClick={onResolve}>{doc.actionLabel}</PillButton>}
        {doc.done && (
          <button type="button" onClick={() => setExpanded((v) => !v)} className="shrink-0 text-[12.5px] cursor-pointer bg-transparent border-none">
            View
          </button>
        )}
      </div>
      {expanded && (
        <div className="mt-2.5 ml-[52px] h-[90px] rounded-xl bg-[repeating-linear-gradient(135deg,#ececea,#ececea_10px,#e2e2e0_10px,#e2e2e0_20px)] flex items-center justify-center text-[11px] font-mono text-ink/50">
          document preview placeholder
        </div>
      )}
    </div>
  );
}
