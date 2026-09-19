import { createHash } from "node:crypto";
import { auth } from "@/lib/auth";
import { getGoogleSheetsAccessToken } from "@/lib/google-sheets-auth";
import { googleSheetsApi } from "@/lib/google-sheets";

type ImportBody = { spreadsheetId?: string; spreadsheetName?: string; sheetName?: string; businessId?: string; replaceDocumentId?: string };

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(values: unknown[][]) {
  return values.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

async function backendToken(request: Request) {
  const response = await fetch(new URL("/api/auth/token", request.url), { headers: { cookie: request.headers.get("cookie") ?? "" } });
  if (!response.ok) throw new Error("Your OnRecord session has expired.");
  return ((await response.json()) as { token?: string }).token ?? "";
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as ImportBody;
  const user = session.user as typeof session.user & { businessId?: string };
  const businessId = body.businessId ?? user.businessId;
  if (!body.spreadsheetId || !body.sheetName || !businessId) {
    return Response.json({ error: "Choose a spreadsheet and sheet first." }, { status: 400 });
  }

  try {
    const accessToken = await getGoogleSheetsAccessToken(request);
    const data = await googleSheetsApi<{ values?: unknown[][] }>(
      `/v4/spreadsheets/${encodeURIComponent(body.spreadsheetId)}/values/${encodeURIComponent(body.sheetName)}`,
      accessToken,
    );
    const csv = toCsv(data.values ?? []);
    if (!csv) return Response.json({ error: "That sheet does not contain any data." }, { status: 422 });
    const bytes = Buffer.from(csv, "utf8");
    const token = await backendToken(request);
		const backendOrigin = (
			process.env.API_BACKEND_ORIGIN ??
			process.env.NEXT_PUBLIC_BACKEND_URL ??
			process.env.NEXT_PUBLIC_API_URL ??
			process.env.NEXT_PUBLIC_API_BASE_URL ??
			"http://localhost:8000"
		).replace(/\/$/, "");
    const filename = `${(body.spreadsheetName ?? "Google Sheets").replace(/[^a-z0-9._-]+/gi, "-")}-${body.sheetName.replace(/[^a-z0-9._-]+/gi, "-")}.csv`;
     const create = await fetch(`${backendOrigin}/v1/businesses/${encodeURIComponent(businessId)}/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
       body: JSON.stringify({ filename, mime: "text/csv", size_bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex"), replace_document_id: body.replaceDocumentId }),
     });
     if (!create.ok) {
       const detail = await create.text().catch(() => "");
       if (create.status === 409) {
         try {
           const duplicate = (await JSON.parse(detail)) as { error?: { detail?: { existing_document_id?: string } } };
           return Response.json({
             error: {
               code: "DUPLICATE_DOCUMENT",
               message: "You have already uploaded this file.",
               detail: duplicate.error?.detail ?? {},
             },
           }, { status: 409 });
         } catch {
           return Response.json({ error: { code: "DUPLICATE_DOCUMENT", message: "You have already imported this sheet." } }, { status: 409 });
         }
       }
       throw new Error(`OnRecord could not create the imported document (${create.status})${detail ? `: ${detail.slice(0, 240)}` : "."}`);
     }
    const target = (await create.json()) as { document_id: string; upload_url: string };
    const upload = await fetch(new URL(target.upload_url, backendOrigin), { method: "PUT", headers: { "Content-Type": "text/csv" }, body: bytes });
     if (!upload.ok) throw new Error(`OnRecord could not store the imported sheet (${upload.status}).`);
    const complete = await fetch(`${backendOrigin}/v1/documents/${target.document_id}/complete`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
     if (!complete.ok) {
       const detail = await complete.text().catch(() => "");
       throw new Error(`OnRecord could not start processing the imported sheet (${complete.status})${detail ? `: ${detail.slice(0, 240)}` : "."}`);
     }
    return Response.json({ documentId: target.document_id, rows: data.values?.length ?? 0 });
   } catch (error) {
     console.error("Google Sheets import failed", error);
     return Response.json({ error: error instanceof Error ? error.message : "The sheet could not be imported." }, { status: 502 });
   }
}
