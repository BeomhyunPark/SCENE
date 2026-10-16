import { http, HttpResponse } from "msw";
import { csrfMatches } from "../csrf";
import { localUsers } from "../fixtures/seed";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type OperatorSession = {
  userId: string;
  displayName: string;
};

let operatorSession: OperatorSession | null = null;

export function resetOperatorSession(): void {
  operatorSession = null;
}

export function currentOperator(): OperatorSession | null {
  return operatorSession;
}

export const sessionHandlers = [
  http.post("/api/v1/operator/auth/login", async ({ request, cookies }) => {
    if (!csrfMatches(request, cookies)) {
      return forbidden();
    }
    const body = await readJson(request);
    if (!isRecord(body) || typeof body.userId !== "string" || !UUID.test(body.userId)) {
      return problem("VALIDATION_FAILED");
    }
    const user = localUsers.find((candidate) => candidate.userId === body.userId);
    if (!user) {
      return problem("AUTHENTICATION_REQUIRED");
    }
    operatorSession = { userId: user.userId, displayName: user.displayName };
    return HttpResponse.json(operatorSession);
  }),
  http.get("/api/v1/operator/me", () => {
    if (!operatorSession) {
      return problem("AUTHENTICATION_REQUIRED");
    }
    return HttpResponse.json(operatorSession);
  }),
  http.post("/api/v1/operator/auth/logout", ({ request, cookies }) => {
    if (!csrfMatches(request, cookies)) {
      return forbidden();
    }
    operatorSession = null;
    return new HttpResponse(null, { status: 204 });
  }),
];

function forbidden(): Response {
  return problem("FORBIDDEN");
}

function problem(code: "FORBIDDEN" | "AUTHENTICATION_REQUIRED" | "VALIDATION_FAILED"): Response {
  const problems = {
    FORBIDDEN: {
      status: 403,
      title: "Forbidden",
      detail: "이 작업을 할 수 없습니다.",
    },
    AUTHENTICATION_REQUIRED: {
      status: 401,
      title: "Authentication required",
      detail: "로그인이 필요합니다.",
    },
    VALIDATION_FAILED: {
      status: 400,
      title: "Validation failed",
      detail: "요청 값이 올바르지 않습니다.",
    },
  } as const;
  const entry = problems[code];
  return HttpResponse.json(
    {
      type: `urn:scene:problem:${code.toLowerCase().replaceAll("_", "-")}`,
      title: entry.title,
      status: entry.status,
      detail: entry.detail,
      code,
      traceId: "mock-trace",
    },
    {
      status: entry.status,
      headers: { "Content-Type": "application/problem+json" },
    },
  );
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return (await request.json()) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
