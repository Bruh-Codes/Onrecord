import { createHash } from "node:crypto";
import { auth } from "@/lib/auth";
import { getGoogleSheetsAccessToken } from "@/lib/google-sheets-auth";
import { googleSheetsApi } from "@/lib/google-sheets";

type ImportBody = { spreadsheetId?: string; spreadsheetName?: string; sheetName?: string; businessId?: string };

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
    const backendOrigin = process.env.API_BACKEND_ORIGIN ?? "http://localhost:8000";
    const filename = `${(body.spreadsheetName ?? "Google Sheets").replace(/[^a-z0-9._-]+/gi, "-")}-${body.sheetName.replace(/[^a-z0-9._-]+/gi, "-")}.csv`;
    const create = await fetch(`${backendOrigin}/v1/businesses/${encodeURIComponent(businessId)}/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ filename, mime: "text/csv", size_bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") }),
    });
    if (!create.ok) throw new Error("OnRecord could not create the imported document.");
    const target = (await create.json()) as { document_id: string; upload_url: string };
    const upload = await fetch(new URL(target.upload_url, backendOrigin), { method: "PUT", headers: { "Content-Type": "text/csv" }, body: bytes });
    if (!upload.ok) throw new Error("OnRecord could not store the imported sheet.");
    const complete = await fetch(`${backendOrigin}/v1/documents/${target.document_id}/complete`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    if (!complete.ok) throw new Error("OnRecord could not start processing the imported sheet.");
    return Response.json({ documentId: target.document_id, rows: data.values?.length ?? 0 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The sheet could not be imported." }, { status: 502 });
  }
}
