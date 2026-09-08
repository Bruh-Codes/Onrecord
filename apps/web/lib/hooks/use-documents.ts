/**
 * Document upload flow: create → PUT bytes to the presigned URL → list.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, sha256Hex, uploadFileToPresignedUrl, ApiError } from "@/lib/api";

export type UploadProgress = { name: string; state: "uploading" | "done" | "error"; message?: string };

export function useUploadDocument(businessId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (file: File): Promise<{ documentId: string; name: string }> => {
      const sha256 = await sha256Hex(file);
      const target = await api.createDocument(businessId, {
        filename: file.name,
        mime: file.type || "application/octet-stream",
        size_bytes: file.size,
        sha256,
      });
      await uploadFileToPresignedUrl(target.upload_url, file, file.type || "application/octet-stream");
      await api.completeDocument(target.document_id);
      return { documentId: target.document_id, name: file.name };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents", businessId] });
    },
  });
}

export async function uploadWithProgress(
  businessId: string,
  files: FileList | File[],
  onProgress: (p: UploadProgress) => void
): Promise<void> {
  for (const file of Array.from(files)) {
    onProgress({ name: file.name, state: "uploading" });
    try {
      const sha256 = await sha256Hex(file);
      const target = await api.createDocument(businessId, {
        filename: file.name,
        mime: file.type || "application/octet-stream",
        size_bytes: file.size,
        sha256,
      });
      await uploadFileToPresignedUrl(target.upload_url, file, file.type || "application/octet-stream");
      await api.completeDocument(target.document_id);
      onProgress({ name: file.name, state: "done" });
    } catch (err) {
      onProgress({
        name: file.name,
        state: "error",
        message: err instanceof ApiError ? err.message : "Upload failed",
      });
    }
  }
}
