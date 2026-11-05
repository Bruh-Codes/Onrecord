"use client";

import { authClient } from "@/lib/auth-client";
import { GOOGLE_SHEETS_SCOPES } from "@/lib/google-sheets";

/**
 * Sends the owner to Google to grant Sheets access. `prompt=consent` with
 * offline access makes Google issue a fresh refresh token every time, which is
 * what fixes an expired or revoked one. Returns an error message, if any.
 */
export async function connectGoogleSheets(callbackURL = "/apps?google_sheets=connected") {
  const result = await authClient.linkSocial({
    provider: "google",
    scopes: [...GOOGLE_SHEETS_SCOPES],
    callbackURL,
    additionalParams: { access_type: "offline", prompt: "consent" },
  });
  return result.error ? (result.error.message ?? "Google authorization failed.") : null;
}
