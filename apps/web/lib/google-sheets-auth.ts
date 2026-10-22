import { auth } from "@/lib/auth";

export async function getGoogleSheetsAccessToken(request: Request) {
  const accounts = await auth.api.listUserAccounts({ headers: request.headers });
  const account = accounts.find((item) => item.providerId === "google");
  if (!account) throw new Error("Connect Google Sheets first.");
  let tokens;
  try {
    tokens = await auth.api.getAccessToken({
      body: { accountId: account.id },
      headers: request.headers,
    });
  } catch (error) {
    console.error("Better Auth Google access-token lookup failed", {
      accountId: account.id,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    throw new Error("Better Auth could not retrieve the Google access token.");
  }
  if (!tokens.accessToken) throw new Error("Google authorization has expired. Please reconnect Google Sheets.");
  return tokens.accessToken;
}
