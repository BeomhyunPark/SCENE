import { http, HttpResponse } from "msw";
import { csrfMatches } from "../csrf";
import { currentParticipant } from "../participantStore";
import { problem } from "../problem";
import {
  createScheduleItem,
  deleteScheduleItem,
  publishSchedule,
  readParticipantSchedule,
  readScheduleBoard,
  updateScheduleItem,
  type ScheduleFailure,
} from "../scheduleStore";
import { currentOperator } from "./session";

/** Shaped like ScheduleController and ParticipantScheduleController (#435, api.md "일정표"). */
const base = "/api/v1/operator/events/:eventId/schedule";

export const scheduleHandlers = [
  http.get(base, ({ params }) => {
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const result = readScheduleBoard(String(params.eventId), operator.userId);
    return isFailure(result) ? failure(result) : HttpResponse.json(result);
  }),
  http.post(`${base}/items`, async ({ params, request, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN");
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    return reply(createScheduleItem(String(params.eventId), operator.userId, await readJson(request)));
  }),
  http.patch(`${base}/items/:itemId`, async ({ params, request, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN");
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    return reply(updateScheduleItem(String(params.eventId), String(params.itemId), operator.userId, await readJson(request)));
  }),
  http.delete(`${base}/items/:itemId`, ({ params, request, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN");
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    return reply(deleteScheduleItem(String(params.eventId), String(params.itemId), operator.userId, new URL(request.url)));
  }),
  http.post(`${base}/publish`, async ({ params, request, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN");
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    return reply(publishSchedule(String(params.eventId), operator.userId, await readJson(request)));
  }),
  http.get("/api/v1/participant/schedule", () => {
    const participant = currentParticipant();
    if (!participant) return problem(401, "AUTHENTICATION_REQUIRED", { detail: "hidden" });
    return HttpResponse.json(readParticipantSchedule(participant.eventId, participant.participantId), {
      headers: { "Cache-Control": "no-store" },
    });
  }),
  // Notifications themselves are B5's; the mock keeps none, so a read changes nothing.
  http.post("/api/v1/participant/notifications/read", ({ request, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    if (!currentParticipant()) return problem(401, "AUTHENTICATION_REQUIRED", { detail: "hidden" });
    return HttpResponse.json({ unreadCount: 0 });
  }),
];

function reply(result: ScheduleFailure | { status: number; body: unknown }): Response {
  if ("body" in result) return HttpResponse.json(result.body as Record<string, unknown>, { status: result.status });
  return failure(result);
}

function failure(result: ScheduleFailure): Response {
  const { status, code, ...extensions } = result;
  return HttpResponse.json(
    { type: `urn:scene:problem:${code.toLowerCase().replaceAll("_", "-")}`, title: code, status, detail: "hidden", code, ...extensions },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

function isFailure(value: object): value is ScheduleFailure {
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
