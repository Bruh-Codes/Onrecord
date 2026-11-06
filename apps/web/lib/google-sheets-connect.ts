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
    // Google or Better Auth problems come back here as ?error=<code>, which the
    // Integrations card explains, instead of a missing /api/auth/error page.
    errorCallbackURL: "/apps",
    additionalParams: { access_type: "offline", prompt: "consent" },
  });
  return result.error ? (result.error.message ?? "Google authorization failed.") : null;
}

/** Plain words for the codes Better Auth sends back when linking Google fails. */
export function googleConnectError(code: string | null): string | null {
  if (!code) return null;
  switch (code) {
    case "account_already_linked_to_different_user":
      return "That Google account is already connected to another OnRecord account. Use a different Google account here, or connect the sheet from the other OnRecord account.";
    case "email_doesn't_match":
    case "email_does_not_match":
      return "That Google account uses a different email from this OnRecord account. Try again, or use the Google account with the same email.";
    case "access_denied":
      return "Google access wasn't given. Press Connect and choose Allow to let OnRecord read your sheets.";
    default:
      return "Google couldn't be connected. Try again.";
  }
}
