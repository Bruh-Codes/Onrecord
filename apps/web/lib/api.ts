/**
 * Client for the apps/api FastAPI backend.
 *
 * Every call forwards the Better Auth session token (`authClient.getSession`),
 * which apps/api verifies against its JWKS endpoint. Sessions are acquired on
 * demand so the token is always fresh (they expire).
 */

import { authClient } from "./auth-client";
import type {
  Business,
  ChecklistItem,
  Counterparty,
  Coverage,
  Document,
  Gap,
  Indicator,
  Me,
  ReadinessScore,
  Transaction,
  UploadTarget,
} from "./api-types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  code: string;
  status: number;
  detail?: unknown;

  constructor(status: number, code: string, message: string, detail?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

async function getToken(): Promise<string> {
  const session = await authClient.getSession();
  const token = session?.data?.session?.token;
  if (!token) {
    throw new ApiError(401, "UNAUTHORIZED", "No active session. Please sign in.");
  }
  return token;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(init.headers as Record<string, string>),
  };
  if (init.body && typeof init.body === "string") {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  if (!res.ok) {
    let body: { error?: { code?: string; message?: string; detail?: unknown } } | null = null;
    try {
      body = await res.json();
    } catch {
      /* not JSON */
    }
    const error = body?.error;
    throw new ApiError(res.status, error?.code ?? "REQUEST_FAILED", error?.message ?? res.statusText, error?.detail);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export const api = {
  // ---- identity ----
  me: () => request<Me>("/v1/me"),

  // ---- businesses ----
  createBusiness: (body: Record<string, unknown>) => request<Business>("/v1/businesses", { method: "POST", body: JSON.stringify(body) }),
  getBusiness: (id: string) => request<Business>(`/v1/businesses/${id}`),
  patchBusiness: (id: string, body: Record<string, unknown>) => request<Business>(`/v1/businesses/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  // ---- documents ----
  createDocument: (businessId: string, body: { filename: string; mime: string; size_bytes: number; sha256: string }) =>
    request<UploadTarget>(`/v1/businesses/${businessId}/documents`, { method: "POST", body: JSON.stringify(body) }),
  listDocuments: (businessId: string, page = 1, pageSize = 50) =>
    request<{ items: Document[]; total: number }>(`/v1/businesses/${businessId}/documents?page=${page}&page_size=${pageSize}`),
  getDocument: (id: string) => request<Document>(`/v1/documents/${id}`),
  completeDocument: (id: string) => request<Document>(`/v1/documents/${id}/complete`, { method: "POST" }),
  confirmDocument: (id: string, docType: string) =>
    request<Document>(`/v1/documents/${id}/confirm`, { method: "POST", body: JSON.stringify({ doc_type: docType }) }),
  deleteDocument: (id: string) => request<void>(`/v1/documents/${id}`, { method: "DELETE" }),

  // ---- accounts ----
  listAccounts: (businessId: string) => request<{ items: { id: string; kind: string; display_suffix: string }[]; total: number }>(`/v1/businesses/${businessId}/accounts`),

  // ---- transactions ----
  listTransactions: (businessId: string, params?: Record<string, string | number>) => {
    const qs = new URLSearchParams(
      Object.entries(params ?? {}).map(([k, v]) => [k, String(v)])
    ).toString();
    return request<{ items: Transaction[]; total: number }>(`/v1/businesses/${businessId}/transactions${qs ? `?${qs}` : ""}`);
  },

  // ---- counterparties ----
  listCounterparties: (businessId: string, params?: Record<string, string | number>) => {
    const qs = new URLSearchParams(
      Object.entries(params ?? {}).map(([k, v]) => [k, String(v)])
    ).toString();
    return request<Counterparty[]>(`/v1/businesses/${businessId}/counterparties${qs ? `?${qs}` : ""}`);
  },

  // ---- analytics ----
  getCoverage: (businessId: string) => request<Coverage>(`/v1/businesses/${businessId}/coverage`),
  listIndicators: (businessId: string) => request<Indicator[]>(`/v1/businesses/${businessId}/indicators`),
  getScore: (businessId: string) => request<ReadinessScore>(`/v1/businesses/${businessId}/score`),
  getChecklist: (businessId: string, rulePack = "gh_mfi_working_capital_v1") =>
    request<ChecklistItem[]>(`/v1/businesses/${businessId}/checklist?rule_pack=${encodeURIComponent(rulePack)}`),
  listGaps: (businessId: string, params?: Record<string, string>) => {
    const qs = new URLSearchParams(params ?? {}).toString();
    return request<Gap[]>(`/v1/businesses/${businessId}/gaps${qs ? `?${qs}` : ""}`);
  },
  waiveGap: (gapId: string, reason: string) =>
    request<Gap>(`/v1/gaps/${gapId}/waive`, { method: "POST", body: JSON.stringify({ reason }) }),
  recompute: (businessId: string) => request<{ task_id: string; state: string }>(`/v1/businesses/${businessId}/recompute`, { method: "POST" }),
  getTask: (taskId: string) => request<{ task_id: string; state: string; progress: number; result: unknown }>(`/v1/tasks/${taskId}`),
};

/** PUT file bytes to a presigned upload URL. A relative URL means the
 * local-dev storage backend routed through the API; prefix it with the API
 * base so the browser PUTs to the right origin. */
export async function uploadFileToPresignedUrl(uploadUrl: string, file: Blob, mime: string): Promise<void> {
  const url = uploadUrl.startsWith("/") ? `${API_BASE_URL}${uploadUrl}` : uploadUrl;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": mime },
    body: file,
  });
  if (!res.ok) {
    throw new ApiError(res.status, "UPLOAD_FAILED", `Upload failed with status ${res.status}`);
  }
}

/** Compute a lowercase hex SHA-256 digest of a Blob/File (client side). */
export async function sha256Hex(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}