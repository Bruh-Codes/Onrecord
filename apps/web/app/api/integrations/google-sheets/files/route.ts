import { auth } from "@/lib/auth";
import { getGoogleSheetsAccessToken } from "@/lib/google-sheets-auth";
import { googleApi } from "@/lib/google-sheets";

export async function GET(request: Request) {
  if (!(await auth.api.getSession({ headers: request.headers }))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const accessToken = await getGoogleSheetsAccessToken(request);
    const data = await googleApi<{ files?: { id: string; name: string; modifiedTime?: string }[] }>(
      "/drive/v3/files?orderBy=modifiedTime%20desc&pageSize=100&spaces=drive&fields=files(id,name,modifiedTime)&q=mimeType%3D%27application%2Fvnd.google-apps.spreadsheet%27%20and%20trashed%3Dfalse",
      accessToken,
    );
    return Response.json({ files: data.files ?? [] });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Google Sheets could not be reached." }, { status: 502 });
  }
}
