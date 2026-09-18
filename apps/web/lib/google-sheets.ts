const GOOGLE_API_ROOT = "https://www.googleapis.com";
const GOOGLE_SHEETS_API_ROOT = "https://sheets.googleapis.com";

export const GOOGLE_SHEETS_SCOPES = [
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
] as const;

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
