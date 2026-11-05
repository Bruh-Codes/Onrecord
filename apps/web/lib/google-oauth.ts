const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Google's own reason a refresh failed, e.g. "invalid_grant" or "invalid_client". */
export class GoogleRefreshError extends Error {
  constructor(
    readonly code: string,
    readonly description: string,
    readonly status: number,
  ) {
    super(`Google refused the token refresh: ${code}${description ? ` (${description})` : ""}`);
  }
}

/**
 * Swaps a Google refresh token for a new access token.
 *
 * Better Auth's built-in refresh hides Google's answer behind a generic
 * "Failed to get a valid access token", so we can't tell an expired grant
 * (owner must reconnect) from a wrong client secret (we must fix the env).
 * This does the same request and logs Google's error code before throwing.
 */
export async function refreshGoogleAccessToken(refreshToken: string) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
    id_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !data.access_token) {
    const error = new GoogleRefreshError(data.error ?? `http_${response.status}`, data.error_description ?? "", response.status);
    // invalid_grant: the refresh token was revoked or expired. Google expires
    // them after 7 days while the OAuth consent screen is in "Testing".
    // invalid_client / unauthorized_client: GOOGLE_CLIENT_ID/SECRET here don't
    // match the client that issued the token.
    console.error("Google token refresh failed", { code: error.code, description: error.description, status: error.status });
    throw error;
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenType: data.token_type,
    idToken: data.id_token,
    scopes: data.scope ? data.scope.split(" ") : undefined,
    accessTokenExpiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
  };
}
