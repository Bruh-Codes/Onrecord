"use client";

import { useState } from "react";
import { ApiError, completeDocumentUpload, createDocumentUploadTarget } from "@/lib/api-client";
import { sha256Hex } from "@/lib/hash";
import { CheckIcon, UploadIcon } from "@/components/icons";

type UploadState = {
  id: string;
  name: string;
  status: "uploading" | "done" | "error";
  error?: string;
};

export function UploadDropzone({ businessId, onUploaded }: { businessId: string; onUploaded: () => void }) {
  const [uploads, setUploads] = useState<UploadState[]>([]);

  async function uploadOne(file: File) {
    const id = crypto.randomUUID();
    setUploads((prev) => [{ id, name: file.name, status: "uploading" }, ...prev]);

    try {
      const sha256 = await sha256Hex(file);
      const target = await createDocumentUploadTarget(businessId, {
        filename: file.name,
        mime: file.type || "application/octet-stream",
        size_bytes: file.size,
        sha256,
      });

      const putRes = await fetch(target.upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) throw new Error("Upload to storage failed.");

      await completeDocumentUpload(target.document_id);
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
                u.status === "error" ? "text-negative" : "text-positive"
              }`}
            >
              {u.status !== "error" && <CheckIcon className="shrink-0" />}
              {u.status === "uploading" && `${u.name} — uploading…`}
              {u.status === "done" && `${u.name} — uploaded, waiting on classification`}
              {u.status === "error" && `${u.name} — ${u.error}`}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
