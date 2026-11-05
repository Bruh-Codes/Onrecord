import { auth } from "@/lib/auth";

/** The owner has to grant Google access again; the UI shows a Reconnect button. */
export class GoogleReconnectError extends Error {}

export async function getGoogleSheetsAccessToken(request: Request) {
  const accounts = await auth.api.listUserAccounts({ headers: request.headers });
  // Same pick as the sync worker (apps/api sheet_sync/google.py): the Google
  // account most recently updated, which is the one last granted access.
  const account = accounts
    .filter((item) => item.providerId === "google")
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  if (!account) throw new GoogleReconnectError("Connect Google Sheets first.");
  let tokens;
  try {
    tokens = await auth.api.getAccessToken({
      body: { accountId: account.id },
      headers: request.headers,
    });
  } catch (error) {
    // Google's actual reason is logged by refreshGoogleAccessToken (lib/google-oauth.ts).
    console.error("Better Auth Google access-token lookup failed", {
      accountId: account.id,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    throw new GoogleReconnectError("Google needs you to allow access again before OnRecord can read your sheets.");
  }
  if (!tokens.accessToken) throw new GoogleReconnectError("Google access has expired. Reconnect Google to keep reading your sheets.");
  return tokens.accessToken;
}

/** JSON error for the Google Sheets routes. `reconnect` tells the page to offer a Reconnect button. */
export function googleSheetsErrorResponse(error: unknown, fallback: string, status = 502) {
  if (error instanceof GoogleReconnectError) {
    return Response.json({ error: error.message, reconnect: true }, { status: 409 });
  }
  // A Google API 401 means the access token we sent is no longer accepted.
  const message = error instanceof Error ? error.message : fallback;
  const reconnect = /invalid authentication credentials|invalid_grant|insufficient.*scope/i.test(message);
  return Response.json({ error: reconnect ? "Google needs you to allow access again before OnRecord can read your sheets." : message, reconnect }, { status: reconnect ? 409 : status });
}
