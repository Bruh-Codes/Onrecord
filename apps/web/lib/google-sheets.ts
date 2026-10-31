const GOOGLE_API_ROOT = "https://www.googleapis.com";
const GOOGLE_SHEETS_API_ROOT = "https://sheets.googleapis.com";

// With Google's file picker configured, OnRecord asks only for the files the
// owner picks (drive.file). That is a non-sensitive scope, so the app does not
// need Google's paid restricted-scope security review. Without the picker it
// falls back to listing every spreadsheet, which needs the broader scopes.
export const GOOGLE_PICKER = {
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY ?? "",
  appId: process.env.NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER ?? "",
};
export const GOOGLE_PICKER_ENABLED = Boolean(GOOGLE_PICKER.apiKey && GOOGLE_PICKER.appId);

export const GOOGLE_SHEETS_SCOPES = GOOGLE_PICKER_ENABLED
  ? (["https://www.googleapis.com/auth/drive.file"] as const)
  : ([
      "https://www.googleapis.com/auth/drive.metadata.readonly",
      "https://www.googleapis.com/auth/spreadsheets.readonly",
    ] as const);

export async function googleApi<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${GOOGLE_API_ROOT}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `Google Sheets returned HTTP ${response.status}.`);
  }
  return (await response.json()) as T;
}

export async function googleSheetsApi<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${GOOGLE_SHEETS_API_ROOT}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `Google Sheets returned HTTP ${response.status}.`);
  }
  return (await response.json()) as T;
}
