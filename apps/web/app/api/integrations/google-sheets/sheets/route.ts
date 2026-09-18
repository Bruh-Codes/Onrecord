import { auth } from "@/lib/auth";
import { getGoogleSheetsAccessToken } from "@/lib/google-sheets-auth";
import { googleSheetsApi } from "@/lib/google-sheets";

export async function GET(request: Request) {
  if (!(await auth.api.getSession({ headers: request.headers }))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const spreadsheetId = new URL(request.url).searchParams.get("spreadsheetId");
  if (!spreadsheetId) return Response.json({ error: "A spreadsheet and Google connection are required." }, { status: 400 });
  try {
    const token = await getGoogleSheetsAccessToken(request);
    const data = await googleSheetsApi<{ sheets?: { properties: { title: string; sheetId: number; gridProperties?: { rowCount?: number; columnCount?: number } } }[] }>(
      `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets(properties(title,sheetId,gridProperties))`,
      token,
    );
    return Response.json({ sheets: data.sheets?.map(({ properties }) => properties) ?? [] });
  } catch (error) {
    console.error("Google Sheets tab lookup failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return Response.json({ error: error instanceof Error ? error.message : "Google Sheets could not be reached." }, { status: 502 });
  }
}
