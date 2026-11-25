import { http, HttpResponse } from "msw";
import { cancel, checkIn, readRoster, readSummary, type CheckInFailure } from "../checkInStore";
import { csrfMatches } from "../csrf";
import { deskStay } from "../deskRooms";
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
    return reply(withRosterRooms(String(params.eventId), readRoster(String(params.eventId), operator.userId, new URL(request.url))));
  }),
  http.post("/api/v1/operator/events/:eventId/check-ins", async ({ params, request, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN");
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const key = request.headers.get("Idempotency-Key");
    return reply(withResultRoom(String(params.eventId), checkIn(String(params.eventId), operator.userId, key, await readJson(request))));
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

/** Adds `room` and `lodging` (G5 #460) to every roster item, from the mock room publication. */
function withRosterRooms(eventId: string, result: object): object {
  if (isFailure(result) || !("items" in result) || !Array.isArray(result.items)) return result;
  const items = (result.items as { participantId: string }[]).map((item) => ({ ...item, ...deskStay(eventId, item.participantId) }));
  return { ...result, items };
}

/** Adds `room` and `lodging` (G5 #460) to a check-in result. */
function withResultRoom(eventId: string, result: object): object {
  if (isFailure(result) || !("participant" in result)) return result;
  const participant = result.participant as { participantId: string };
  return { ...result, ...deskStay(eventId, participant.participantId) };
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
