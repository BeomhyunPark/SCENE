import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { apiRequest } from "./client";
import { ApiError, isApiError } from "./errors";
import { server } from "../mocks/server";

function readCsrfCookie(): string | undefined {
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");
    if (separator !== -1 && trimmed.slice(0, separator) === "XSRF-TOKEN") {
      return trimmed.slice(separator + 1);
    }
  }
  return undefined;
}

beforeEach(() => {
  document.cookie = "XSRF-TOKEN=; Path=/; Max-Age=0";
});

describe("apiRequest", () => {
  it("sends GET without a CSRF header", async () => {
    document.cookie = "XSRF-TOKEN=already-set; Path=/";
    let header: string | null = "missing";
    server.use(
      http.get("/api/v1/probe", ({ request }) => {
        header = request.headers.get("X-XSRF-TOKEN");
        return HttpResponse.json({ ok: true });
      }),
    );

    await expect(apiRequest<{ ok: boolean }>("/api/v1/probe")).resolves.toEqual({ ok: true });
    expect(header).toBeNull();
  });

  it("creates a CSRF token when the cookie is missing", async () => {
    let header: string | null = null;
    server.use(
      http.post("/api/v1/probe", ({ request }) => {
        header = request.headers.get("X-XSRF-TOKEN");
        return HttpResponse.json({ ok: true });
      }),
    );

    await apiRequest("/api/v1/probe", { method: "POST", body: { userId: "u" } });

    expect(header).toBeTruthy();
    expect(readCsrfCookie()).toBe(header);
  });

  it("reuses the existing CSRF cookie", async () => {
    document.cookie = "XSRF-TOKEN=existing-token; Path=/";
    let header: string | null = null;
    server.use(
      http.post("/api/v1/probe", ({ request }) => {
        header = request.headers.get("X-XSRF-TOKEN");
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(apiRequest("/api/v1/probe", { method: "POST" })).resolves.toBeUndefined();
    expect(header).toBe("existing-token");
    expect(readCsrfCookie()).toBe("existing-token");
  });

  it("returns undefined for an empty 200", async () => {
    server.use(
      http.get("/api/v1/probe", () => new HttpResponse(null, { status: 200 })),
    );

    await expect(apiRequest("/api/v1/probe")).resolves.toBeUndefined();
  });

  it("reads task from a 409 TASK_VERSION_CONFLICT", async () => {
    server.use(
      http.get("/api/v1/probe", () =>
        HttpResponse.json(
          {
            type: "urn:scene:problem:task-version-conflict",
            title: "Task version conflict",
            status: 409,
            detail: "다른 사람이 먼저 이 업무를 바꿨습니다.",
            code: "TASK_VERSION_CONFLICT",
            traceId: "trace-409",
            task: { id: "task-1", version: 4 },
          },
          { status: 409, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );

    const error = await apiRequest("/api/v1/probe").catch((caught: unknown) => caught);
    expect(isApiError(error, "TASK_VERSION_CONFLICT")).toBe(true);
    expect(error).toBeInstanceOf(ApiError);
    if (!(error instanceof ApiError)) {
      return;
    }
    expect(error.status).toBe(409);
    expect(error.traceId).toBe("trace-409");
    expect(error.extensions.task).toEqual({ id: "task-1", version: 4 });
  });

  it("reads the first field error from a 400", async () => {
    server.use(
      http.get("/api/v1/probe", () =>
        HttpResponse.json(
          {
            type: "urn:scene:problem:validation-failed",
            title: "Validation failed",
            status: 400,
            detail: "요청 값이 올바르지 않습니다.",
            code: "VALIDATION_FAILED",
            traceId: "trace-400",
            errors: [{ field: "version", code: "REQUIRED", message: "must not be null" }],
          },
          { status: 400 },
        ),
      ),
    );

    const error = await apiRequest("/api/v1/probe").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    if (!(error instanceof ApiError)) {
      return;
    }
    expect(error.errors?.[0]?.field).toBe("version");
  });

  it("maps a 500 without a code to UNEXPECTED", async () => {
    server.use(
      http.get("/api/v1/probe", () =>
        HttpResponse.json(
          {
            type: "urn:scene:problem:unexpected",
            title: "Unexpected error",
            status: 500,
            detail: "요청을 처리하지 못했습니다.",
            traceId: "trace-500",
          },
          { status: 500, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );

    await expect(apiRequest("/api/v1/probe")).rejects.toMatchObject({
      status: 500,
      code: "UNEXPECTED",
    });
  });

  it("maps a failed fetch to NETWORK_ERROR", async () => {
    server.use(http.get("/api/v1/probe", () => HttpResponse.error()));

    await expect(apiRequest("/api/v1/probe")).rejects.toMatchObject({
      status: 0,
      code: "NETWORK_ERROR",
    });
  });
});
