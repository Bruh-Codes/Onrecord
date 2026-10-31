import { auth } from "@/lib/auth";
import { getGoogleSheetsAccessToken } from "@/lib/google-sheets-auth";

// Google's file picker runs in the browser and needs the owner's own access token.
export async function GET(request: Request) {
  if (!(await auth.api.getSession({ headers: request.headers }))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json({ accessToken: await getGoogleSheetsAccessToken(request) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Google is not connected." }, { status: 409 });
  }
}
