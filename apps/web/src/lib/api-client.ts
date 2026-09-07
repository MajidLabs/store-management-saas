import { ApiErrorBody } from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(Array.isArray(body.message) ? body.message.join(", ") : body.message);
    this.status = status;
    this.body = body;
  }
}

/** Reads the (non-httpOnly, by design) CSRF cookie so it can be echoed
 * back in the X-CSRF-Token header. This is the standard double-submit
 * pattern: safe because an attacker's page can read neither this cookie
 * nor any response from this origin, so it can't forge a matching header
 * even though the browser would attach the httpOnly auth cookies to a
 * forged request automatically. */
function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  // Coalesce concurrent 401s into a single refresh call instead of racing
  // multiple refresh requests (which would invalidate each other's token).
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: getCsrfToken() ? { "X-CSRF-Token": getCsrfToken() as string } : {},
        });
        return res.ok;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Set automatically for /auth/* calls to avoid an infinite refresh loop. */
  skipAuthRetry?: boolean;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { body, skipAuthRetry, headers, ...rest } = options;
  const isFormData = body instanceof FormData;
  const method = (rest.method ?? "GET").toUpperCase();

  const doFetch = async (): Promise<Response> => {
    const csrfToken = MUTATING_METHODS.has(method) ? getCsrfToken() : null;
    return fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      credentials: "include",
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
    });
  };

  let res = await doFetch();

  if (res.status === 401 && !skipAuthRetry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await doFetch();
    }
    // No client-side token to clear on failure - the httpOnly cookies (if
    // any existed) are either still valid or the server has already
    // rejected them; either way there's nothing this code can clean up
    // itself. AuthContext's own 401 handling covers redirecting to login.
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await res.json() : undefined;

  if (!res.ok) {
    throw new ApiError(
      res.status,
      data ?? {
        statusCode: res.status,
        message: res.statusText,
        error: "Error",
        timestamp: new Date().toISOString(),
        path,
      },
    );
  }

  return data as T;
}

export { API_BASE_URL };
