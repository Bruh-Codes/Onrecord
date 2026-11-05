import { auth } from "@/lib/auth";
import { getGoogleSheetsAccessToken, googleSheetsErrorResponse } from "@/lib/google-sheets-auth";

// Google's file picker runs in the browser and needs the owner's own access token.
export async function GET(request: Request) {
  if (!(await auth.api.getSession({ headers: request.headers }))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json({ accessToken: await getGoogleSheetsAccessToken(request) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return googleSheetsErrorResponse(error, "Google is not connected.", 409);
  }
}
