"use client";

import { useAppActions, useAppState } from "@/lib/app-state";
import { CheckIcon, UploadIcon } from "@/components/icons";

export function UploadDropzone() {
  const { uploadedFiles } = useAppState();
  const { addUploadedFiles } = useAppActions();

  return (
    <div>
      <label className="relative flex items-center justify-center gap-2 border-[1.5px] border-dashed border-ink/30 rounded-2xl p-5.5 cursor-pointer mb-3 text-ink">
        <input
          type="file"
          multiple
          className="absolute w-px h-px opacity-0"
          onChange={(e) => {
            if (e.target.files) addUploadedFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <UploadIcon />
        <span className="text-[13.5px] font-semibold">
          Upload any file — statement, receipt, or a photo of a ledger page
        </span>
      </label>

      {uploadedFiles.length > 0 && (
        <div className="mb-3">
          {uploadedFiles.map((f) => (
            <div key={f.id} className="flex items-center gap-2 text-[12.5px] py-2 px-1 text-positive">
              <CheckIcon className="shrink-0" />
              {f.name} — uploaded, waiting on classification
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
