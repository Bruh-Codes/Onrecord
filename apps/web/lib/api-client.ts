// Typed client for apps/api (specs/09-api.md). Every call attaches the
// current session's Better Auth-issued JWT as a Bearer token — apps/api
// verifies it against Better Auth's JWKS endpoint and never sees credentials
// directly (Agent.md §4).

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  code: string;
  httpStatus: number;
  detail?: Record<string, unknown>;

  constructor(code: string, message: string, httpStatus: number, detail?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.detail = detail;
  }
}

async function getBearerToken(): Promise<string> {
  const res = await fetch("/api/auth/token", { credentials: "include" });
  if (!res.ok) throw new ApiError("UNAUTHENTICATED", "Not signed in.", res.status);
  const { token } = (await res.json()) as { token: string };
  return token;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getBearerToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const error = body?.error as { code?: string; message?: string; detail?: Record<string, unknown> } | undefined;
    throw new ApiError(
      error?.code ?? "UNKNOWN_ERROR",
      error?.message ?? `Request to ${path} failed with ${res.status}.`,
      res.status,
      error?.detail
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// --- Businesses (specs/09-api.md §2 "Businesses") ---

export type EntityType = "sole_prop" | "partnership" | "ltd" | "ngo";

export type BusinessCreate = {
  legal_name: string;
  trading_name?: string;
  entity_type: EntityType;
  registration_number?: string;
  tin?: string;
  sector_code?: string;
  region?: string;
  premises_status?: string;
};

export type DeclaredValue<T> = { value: T; kind: "declared" };

export type BusinessDetail = {
  id: string;
  legal_name: string;
  trading_name: string | null;
  entity_type: EntityType;
  registration_number: string | null;
  tin: string | null;
  sector_code: string | null;
  established_on: string | null;
  region: string | null;
  premises_status: DeclaredValue<string> | null;
  employee_count_declared: DeclaredValue<number> | null;
};

export function createBusiness(body: BusinessCreate) {
  return apiFetch<BusinessDetail>("/v1/businesses", { method: "POST", body: JSON.stringify(body) });
}

export function getBusiness(businessId: string) {
  return apiFetch<BusinessDetail>(`/v1/businesses/${businessId}`);
}

export function patchBusiness(businessId: string, body: Partial<BusinessCreate>) {
  return apiFetch<BusinessDetail>(`/v1/businesses/${businessId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

// --- Documents (specs/09-api.md §2 "Documents") ---

export type DocumentCreate = { filename: string; mime: string; size_bytes: number; sha256: string };

export type DocumentUploadTarget = { document_id: string; upload_url: string; upload_expires_at: string };

export type DocumentStatus = "received" | "classified" | "extracted" | "reconciliation_failed" | "failed" | "superseded";

export type DocumentSummary = {
  id: string;
  doc_type: string | null;
  doc_type_confidence: number | null;
  issuer: string | null;
  period_start: string | null;
  period_end: string | null;
  status: DocumentStatus;
  created_at: string;
};

export type Page<T> = { items: T[]; total: number; page: number; page_size: number };

export function createDocumentUploadTarget(businessId: string, body: DocumentCreate) {
  return apiFetch<DocumentUploadTarget>(`/v1/businesses/${businessId}/documents`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function completeDocumentUpload(documentId: string) {
  return apiFetch<{ status: DocumentStatus }>(`/v1/documents/${documentId}/complete`, { method: "POST" });
}

export function listDocuments(businessId: string, page = 1, pageSize = 50) {
  return apiFetch<Page<DocumentSummary>>(
    `/v1/businesses/${businessId}/documents?page=${page}&page_size=${pageSize}`
  );
}

export function deleteDocument(documentId: string) {
  return apiFetch<void>(`/v1/documents/${documentId}`, { method: "DELETE" });
}
