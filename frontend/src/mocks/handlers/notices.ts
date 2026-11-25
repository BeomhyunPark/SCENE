import { http, HttpResponse } from "msw";
import { csrfMatches } from "../csrf";
import {
  commandOperatorNotice,
  createOperatorNotice,
  deleteOperatorNotice,
  listOperatorNotices,
  listParticipantNotices,
  patchOperatorNotice,
  readOperatorNotice,
  readParticipantNotice,
  type NoticeFailure,
} from "../noticeStore";
import { currentParticipant } from "../participantStore";
import { problem } from "../problem";
import { currentOperator } from "./session";

const BASE = "/api/v1/operator/events/:eventId/notices";
const NO_STORE = { headers: { "Cache-Control": "no-store" } };

/** Shaped like NoticeController and ParticipantNoticeController (D2, #434). */
export const noticeHandlers = [
  http.get(BASE, ({ request, params }) => {
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    return reply(listOperatorNotices(String(params.eventId), operator.userId, new URL(request.url).searchParams));
  }),
  http.post(BASE, async ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN");
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    return reply(createOperatorNotice(String(params.eventId), operator.userId, await readJson(request)), 201);
  }),
  http.get(`${BASE}/:noticeId`, ({ params }) => {
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    return reply(readOperatorNotice(String(params.eventId), String(params.noticeId), operator.userId));
  }),
  http.patch(`${BASE}/:noticeId`, async ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN");
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    return reply(patchOperatorNotice(String(params.eventId), String(params.noticeId), operator.userId, await readJson(request)));
  }),
  http.delete(`${BASE}/:noticeId`, ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN");
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const failed = deleteOperatorNotice(
      String(params.eventId),
      String(params.noticeId),
      operator.userId,
      new URL(request.url).searchParams,
    );
    return failed ? fail(failed) : new HttpResponse(null, { status: 204 });
  }),
  http.post(`${BASE}/:noticeId/:command`, async ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN");
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    return reply(
      commandOperatorNotice(
        String(params.eventId),
        String(params.noticeId),
        operator.userId,
        String(params.command),
        await readJson(request),
      ),
    );
  }),
  http.get("/api/v1/participant/notices", ({ request }) => {
    const participant = currentParticipant();
    if (!participant) return problem(401, "AUTHENTICATION_REQUIRED", { detail: "hidden" });
    const result = listParticipantNotices(participant.eventId, participant.participantId, new URL(request.url).searchParams);
    return "code" in result ? fail(result) : HttpResponse.json(result, NO_STORE);
  }),
  http.get("/api/v1/participant/notices/:noticeId", ({ params }) => {
    const participant = currentParticipant();
    if (!participant) return problem(401, "AUTHENTICATION_REQUIRED", { detail: "hidden" });
    const result = readParticipantNotice(participant.eventId, participant.participantId, String(params.noticeId));
    return "code" in result ? fail(result as NoticeFailure) : HttpResponse.json(result, NO_STORE);
  }),
];

function reply(result: unknown, status = 200): Response {
  if (result && typeof result === "object" && "code" in result && "status" in result) return fail(result as NoticeFailure);
  return HttpResponse.json(result as Record<string, unknown>, { status });
}

function fail(failure: NoticeFailure): Response {
  const { status, code, ...extra } = failure;
  return HttpResponse.json(
    {
      type: `urn:scene:problem:${code.toLowerCase().replaceAll("_", "-")}`,
      title: code,
      status,
      detail: "hidden",
      code,
      traceId: "mock-trace",
      ...extra,
    },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
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
