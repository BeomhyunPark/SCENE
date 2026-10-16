import { ApiError, isApiErrorCode, type ApiErrorCode, type ApiFieldError } from "./errors";
import { noteMockResponse } from "./mockNotice";

const CSRF_COOKIE = "XSRF-TOKEN";
const CSRF_HEADER = "X-XSRF-TOKEN";
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const PROBLEM_KEYS = new Set([
  "type",
  "title",
  "status",
  "detail",
  "code",
  "traceId",
  "errors",
]);

export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ApiRequestOptions = {
  method?: ApiMethod;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
};

export async function apiRequest<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  const method = options?.method ?? "GET";
  const url = new URL(path, window.location.origin);
  if (options?.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers = new Headers();
  headers.set("Accept", "application/json");
  let body: string | undefined;
  if (options?.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.body);
  }
  if (MUTATING.has(method)) {
    headers.set(CSRF_HEADER, ensureCsrfToken());
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body,
      credentials: "include",
      signal: options?.signal,
    });
  } catch {
    throw new ApiError({ status: 0, code: "NETWORK_ERROR" });
  }

  noteMockResponse(response.headers);

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (response.ok && response.status === 200 && text.length === 0) {
    return undefined as T;
  }
  if (response.ok) {
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError({ status: response.status, code: "UNEXPECTED" });
    }
  }

  throw problemError(response.status, text);
}

function ensureCsrfToken(): string {
  const existing = readCookie(CSRF_COOKIE);
  if (existing) {
    return existing;
  }
  const token = crypto.randomUUID();
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CSRF_COOKIE}=${token}; Path=/; SameSite=Lax${secure}`;
  return token;
}

function readCookie(name: string): string | undefined {
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");
    if (separator === -1 || trimmed.slice(0, separator) !== name) {
      continue;
    }
    const value = trimmed.slice(separator + 1);
    return value.length > 0 ? value : undefined;
  }
  return undefined;
}

function problemError(status: number, text: string): ApiError {
  const body = parseJson(text);
  const record = isRecord(body) ? body : undefined;
  const code = codeFrom(record);
  const errors = parseErrors(record?.errors);
  const extensions: Record<string, unknown> = {};
  if (record) {
    for (const [key, value] of Object.entries(record)) {
      if (!PROBLEM_KEYS.has(key)) {
        extensions[key] = value;
      }
    }
  }
  return new ApiError({
    status,
    code,
    title: stringField(record?.title),
    detail: stringField(record?.detail),
    traceId: stringField(record?.traceId),
    errors,
    extensions,
  });
}

/** Missing or unknown `code` is UNEXPECTED. A 5xx problem omits `code`. */
function codeFrom(record: Record<string, unknown> | undefined): ApiErrorCode {
  if (isApiErrorCode(record?.code)) {
    return record.code;
  }
  return "UNEXPECTED";
}

function parseErrors(value: unknown): ApiFieldError[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const errors: ApiFieldError[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.field !== "string" || item.field.length === 0) {
      continue;
    }
    const error: ApiFieldError = { field: item.field };
    if (typeof item.code === "string") {
      error.code = item.code;
    }
    if (typeof item.message === "string") {
      error.message = item.message;
    }
    errors.push(error);
  }
  return errors.length > 0 ? errors : undefined;
}

function parseJson(text: string): unknown {
  if (text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
