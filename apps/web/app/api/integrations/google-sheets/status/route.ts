import { auth } from "@/lib/auth";
import { GOOGLE_SHEETS_SCOPES } from "@/lib/google-sheets";

export async function GET(request: Request) {
  if (!(await auth.api.getSession({ headers: request.headers }))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const accounts = await auth.api.listUserAccounts({ headers: request.headers });
  const google = accounts.filter((account) => account.providerId === "google");
  // Signing in with Google links a Google account too, but only with name and
  // email access. Sheets counts as connected once the Sheets scopes are granted.
  const connected = google.some((account) => GOOGLE_SHEETS_SCOPES.every((scope) => account.scopes.includes(scope)));
  return Response.json({ connected, googleLinked: google.length > 0 });
}
