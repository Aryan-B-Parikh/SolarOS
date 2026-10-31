'use client';

/**
 * Shared client-side API helper for staff/field apps.
 *
 * - Sends the HttpOnly session cookie automatically (same-origin fetch).
 * - NEVER sends x-user-id / x-user-role headers: identity comes from the
 *   DB-backed session (Spec 2.6 / D13). Do not re-introduce spoofable headers.
 * - Normalizes error handling and optional idempotency keys (D16).
 */

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  status: number;
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json();
    return {
      code: body?.error?.code || 'UNKNOWN',
      message: body?.error?.message || res.statusText || 'Request failed',
      details: body?.error?.details,
      status: res.status,
    };
  } catch {
    return {
      code: 'NETWORK',
      message: res.statusText || 'Network error',
      status: res.status,
    };
  }
}

export async function apiFetch<T = any>(
  url: string,
  options: RequestInit & { idempotencyKey?: string } = {}
): Promise<T> {
  const { idempotencyKey, headers, ...rest } = options;
  const finalHeaders: Record<string, string> = {
    ...(rest.body && !(rest.body instanceof FormData)
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...(idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {}),
    ...((headers as Record<string, string>) || {}),
  };

  const res = await fetch(url, {
    credentials: 'same-origin',
    ...rest,
    headers: finalHeaders,
  });

  if (!res.ok) {
    throw await parseError(res);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json() as Promise<T>;
  }
  return res as unknown as T;
}

/** Convenience helpers */
export const apiGet = <T = any>(url: string) => apiFetch<T>(url, { method: 'GET' });
export const apiPost = <T = any>(url: string, body?: unknown, idempotencyKey?: string) =>
  apiFetch<T>(url, {
    method: 'POST',
    body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    idempotencyKey,
  });
export const apiPatch = <T = any>(url: string, body?: unknown) =>
  apiFetch<T>(url, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
export const apiDelete = <T = any>(url: string) => apiFetch<T>(url, { method: 'DELETE' });
