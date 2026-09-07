"use client";

import { useState } from "react";
import { useAppActions } from "@/lib/app-state";
import { CheckIcon, UploadIcon } from "@/components/icons";
import { useMe } from "@/lib/hooks/use-business";
import { useUploadDocument } from "@/lib/hooks/use-documents";

export function UploadDropzone() {
  const { businessId } = useMe();
  const { addUploadedFiles } = useAppActions();
  const upload = useUploadDocument(businessId ?? "");
  const [items, setItems] = useState<
    { id: string; name: string; state: "uploading" | "done" | "error"; message?: string }[]
  >([]);

  async function handleFiles(files: FileList | null) {
    if (!files || !businessId) return;
    addUploadedFiles(files);
    const entries = Array.from(files).map((f) => ({
      id: Math.random().toString(36).slice(2),
      name: f.name,
      state: "uploading" as const,
    }));
    setItems((prev) => [...entries, ...prev]);

    for (const f of Array.from(files)) {
      try {
        await upload.mutateAsync(f);
        setItems((prev) =>
          prev.map((e) => (e.name === f.name && e.state === "uploading" ? { ...e, state: "done" } : e))
        );
      } catch (err) {
        setItems((prev) =>
          prev.map((e) =>
            e.name === f.name && e.state === "uploading"
              ? { ...e, state: "error", message: err instanceof Error ? err.message : "Upload failed" }
              : e
          )
        );
      }
    }
  }

  return (
    <div>
      <label className="relative flex items-center justify-center gap-2 border-[1.5px] border-dashed border-ink/30 rounded-2xl p-5.5 cursor-pointer mb-3 text-ink">
        <input
          id="upload-input"
          type="file"
          multiple
          className="absolute w-px h-px opacity-0"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <UploadIcon />
        <span className="text-[13.5px] font-semibold">
          Upload any file — statement, receipt, or a photo of a ledger page
        </span>
      </label>

      {items.length > 0 && (
        <div className="mb-3">
          {items.map((f) => (
            <div
              key={f.id}
              className={`flex items-center gap-2 text-[12.5px] py-2 px-1 ${
                f.state === "error" ? "text-negative" : f.state === "done" ? "text-positive" : "opacity-70"
              }`}
            >
              {f.state === "done" ? (
                <CheckIcon className="shrink-0" />
              ) : f.state === "error" ? (
                <span className="w-3.5 h-3.5 shrink-0 text-negative font-bold">!</span>
              ) : (
                <span className="w-3.5 h-3.5 shrink-0">
                  <span className="inline-block w-3.5 h-3.5 border-2 border-ink/20 border-t-ink rounded-full animate-spin" />
                </span>
              )}
              <span className="truncate">{f.name}</span>
              <span className="ml-auto shrink-0">
                {f.state === "done" ? "uploaded — queued for classification" : f.state === "error" ? f.message ?? "failed" : "uploading…"}
              </span>
            </div>
          ))}
        </div>
      )}
      {upload.isPending && (
        <div className="text-[12.5px] opacity-60 mb-2">Avoid closing the tab while files upload.</div>
      )}
    </div>
  );
}