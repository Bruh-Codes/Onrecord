"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Spreadsheet = { id: string; name: string; modifiedTime?: string };
type Sheet = { title: string; sheetId: number };

export function GoogleSheetsConnect() {
  const router = useRouter();
  const [files, setFiles] = useState<Spreadsheet[]>([]);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetsLoading, setSheetsLoading] = useState(false);
  const [fileId, setFileId] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "importing" | "done" | "error">("loading");
  const [message, setMessage] = useState("");
  const [duplicateDocumentId, setDuplicateDocumentId] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/integrations/google-sheets/files")
      .then(async (response) => ({ response, data: (await response.json()) as { files?: Spreadsheet[]; error?: string } }))
      .then(({ response, data }) => {
        if (!response.ok) {
          setStatus("error");
          setMessage(data.error ?? "Could not load your Google Sheets.");
          return;
        }
        setFiles(data.files ?? []);
        setStatus("ready");
      })
      .catch(() => {
        setStatus("error");
        setMessage("Could not load your Google Sheets.");
      });
  }, []);

  async function selectFile(id: string) {
    setFileId(id);
    setSheetName("");
    setSheets([]);
    setMessage("");
    if (!id) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    setSheetsLoading(true);
    try {
      const response = await fetch(`/api/integrations/google-sheets/sheets?spreadsheetId=${encodeURIComponent(id)}`, {
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => ({}))) as { sheets?: Sheet[]; error?: string };
      if (!response.ok) {
        showError(data.error ?? "Could not load the sheets.");
        return;
      }
      setSheets(data.sheets ?? []);
    } catch (error) {
      showError(error instanceof DOMException && error.name === "AbortError" ? "Loading sheet tabs timed out." : "Could not load the sheet tabs.");
    } finally {
      window.clearTimeout(timeout);
      setSheetsLoading(false);
    }
  }

  async function importSheet(replaceDocumentId?: string) {
    const file = files.find((item) => item.id === fileId);
    if (!file || !sheetName) return;
    setStatus("importing");
    setDuplicateDocumentId(null);
    const response = await fetch("/api/integrations/google-sheets/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spreadsheetId: file.id, spreadsheetName: file.name, sheetName, replaceDocumentId }),
    });
    const data = (await response.json()) as {
      rows?: number;
      error?: string | { code?: string; message?: string; detail?: { existing_document_id?: string } };
    };
    if (!response.ok) {
      const error = typeof data.error === "string" ? data.error : data.error?.message;
      if (response.status === 409 || (typeof data.error !== "string" && data.error?.code === "DUPLICATE_DOCUMENT")) {
        const duplicateId = typeof data.error !== "string" ? data.error?.detail?.existing_document_id : undefined;
        setDuplicateDocumentId(duplicateId ?? null);
        setStatus("error");
        setMessage("This sheet has already been imported.");
        return;
      }
      return showError(error ?? "Could not import that sheet.");
    }
    setStatus("done");
    setMessage(`${data.rows ?? 0} rows sent to OnRecord for processing.`);
    router.push("/documents");
  }

  function showError(error: string) {
    setStatus("error");
    setMessage(error);
  }

  return (
    <div className="flex flex-col gap-3 w-full max-w-[440px]">
      {status === "loading" ? <span className="text-[12px] opacity-65">Loading your spreadsheets...</span> : null}
      {files.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select value={fileId} onChange={(event) => void selectFile(event.target.value)} className="min-w-0 flex-1 text-[12px] px-2.5 py-2 rounded-lg bg-background border border-foreground/15">
              <option value="">Choose a spreadsheet</option>
              {files.map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}
            </select>
            <button type="button" disabled={!sheetName || status === "importing"} onClick={() => void importSheet()} className="shrink-0 bg-foreground text-background text-[13px] px-4 py-2 rounded-full disabled:opacity-40 disabled:cursor-not-allowed">
              {status === "importing" ? "Importing..." : "Import"}
            </button>
          </div>
          {fileId && (
            <select
              aria-busy={sheetsLoading}
              disabled={sheetsLoading || sheets.length === 0}
              value={sheetName}
              onChange={(event) => setSheetName(event.target.value)}
              className="w-full text-[12px] px-2.5 py-2 rounded-lg bg-background border border-foreground/15 disabled:opacity-60"
            >
              <option value="">{sheetsLoading ? "Loading sheet tabs..." : sheets.length === 0 ? "No sheet tabs found" : "Choose a sheet tab"}</option>
              {sheets.map((sheet) => <option key={sheet.sheetId} value={sheet.title}>{sheet.title}</option>)}
            </select>
          )}
          {message && status === "error" ? <span className="text-[11px] text-destructive">{message}</span> : null}
        </>
      ) : status === "error" ? (
        <div className="flex flex-wrap items-center gap-2 text-[12px] opacity-70">
          <span>{message}</span>
          {duplicateDocumentId ? (
            <button type="button" onClick={() => void importSheet(duplicateDocumentId)} className="font-semibold underline underline-offset-2">
              Replace existing
            </button>
          ) : (
            <Link href="/apps" className="underline underline-offset-2">Connect Google Sheets in Integrations</Link>
          )}
        </div>
      ) : status === "ready" ? <span className="text-[12px] opacity-65">No Google Sheets were found in this account.</span> : null}
      {message && status !== "error" ? <span className="text-[11px] text-right opacity-65">{message}</span> : null}
    </div>
  );
}
