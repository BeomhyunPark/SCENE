import { http, HttpResponse } from "msw";
import { cancel, checkIn, readRoster, readSummary, type CheckInFailure } from "../checkInStore";
import { csrfMatches } from "../csrf";
import { problem } from "../problem";
import { currentOperator } from "./session";

/** Shaped like CheckInController (#282). QR values use the mock tag in checkInStore; check-in logs are not mocked. */
export const checkInHandlers = [
  http.get("/api/v1/operator/events/:eventId/check-ins/summary", ({ params }) => {
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    return reply(readSummary(String(params.eventId), operator.userId));
  }),
  http.get("/api/v1/operator/events/:eventId/check-in-roster", ({ params, request }) => {
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    return reply(readRoster(String(params.eventId), operator.userId, new URL(request.url)));
  }),
  http.post("/api/v1/operator/events/:eventId/check-ins", async ({ params, request, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN");
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const key = request.headers.get("Idempotency-Key");
    return reply(checkIn(String(params.eventId), operator.userId, key, await readJson(request)));
  }),
  http.post("/api/v1/operator/events/:eventId/check-ins/:checkInId/cancel", async ({ params, request, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN");
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const key = request.headers.get("Idempotency-Key");
    return reply(
      cancel(String(params.eventId), String(params.checkInId), operator.userId, key, await readJson(request)),
    );
  }),
];

function reply(result: object): Response {
  if (isFailure(result)) {
    return problem(result.status, result.code, {
      errors: result.errors,
      eventStatus: result.eventStatus,
      reason: result.reason,
      detail: "hidden",
    });
  }
  return HttpResponse.json(result);
}

function isFailure(value: object): value is CheckInFailure {
  return "status" in value && typeof (value as { status: unknown }).status === "number" && "code" in value;
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length === 0) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
