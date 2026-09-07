"use client";

import { useState } from "react";
import { CheckIcon, UploadIcon } from "@/components/icons";
import { ApiError } from "@/lib/api";
import { useUploadDocument } from "@/lib/hooks/use-documents";

type UploadState = { id: string; name: string; status: "uploading" | "done" | "error"; error?: string };

export function UploadDropzone({ businessId, onUploaded }: { businessId: string; onUploaded: () => void }) {
  const upload = useUploadDocument(businessId);
  const [uploads, setUploads] = useState<UploadState[]>([]);

  async function uploadOne(file: File) {
    const id = crypto.randomUUID();
    setUploads((prev) => [{ id, name: file.name, status: "uploading" }, ...prev]);
    try {
      await upload.mutateAsync(file);
      setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, status: "done" } : u)));
      onUploaded();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
      setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, status: "error", error: message } : u)));
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
            const files = e.target.files;
            if (files) Array.from(files).forEach(uploadOne);
            e.target.value = "";
          }}
        />
        <UploadIcon />
        <span className="text-[13.5px] font-semibold">
          Upload any file — statement, receipt, or a photo of a ledger page
        </span>
      </label>

      {uploads.length > 0 && (
        <div className="mb-3">
          {uploads.map((u) => (
            <div
              key={u.id}
              className={`flex items-center gap-2 text-[12.5px] py-2 px-1 ${
                u.status === "error" ? "text-negative" : u.status === "done" ? "text-positive" : "opacity-70"
              }`}
            >
              {u.status === "done" ? (
                <CheckIcon className="shrink-0" />
              ) : u.status === "error" ? (
                <span className="w-3.5 h-3.5 shrink-0 text-negative font-bold">!</span>
              ) : (
                <span className="w-3.5 h-3.5 shrink-0">
                  <span className="inline-block w-3.5 h-3.5 border-2 border-ink/20 border-t-ink rounded-full animate-spin" />
                </span>
              )}
              <span className="truncate">{u.name}</span>
              <span className="ml-auto shrink-0">
                {u.status === "done"
                  ? "uploaded — queued for classification"
                  : u.status === "error"
                    ? u.error
                    : "uploading…"}
              </span>
            </div>
          ))}
        </div>
      )}
      {upload.isPending && <div className="text-[12.5px] opacity-60 mb-2">Avoid closing the tab while files upload.</div>}
    </div>
  );
}