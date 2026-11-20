import { http, HttpResponse } from "msw";
import { csrfMatches } from "../csrf";
import { checkInValue, markRead, pageOf, summaryOf } from "../notificationStore";
import { noticeBoardVersion } from "../noticeStore";
import { eventById } from "../operatorStore";
import { problem } from "../problem";
import { eventRoleOf } from "../taskStore";
import { currentOperator } from "./session";

/** Mirrors `scene.operator.poll-after-seconds` (default 15). */
export const MOCK_OPERATOR_POLL_SECONDS = 15;

const NO_STORE = { headers: { "Cache-Control": "no-store" } };

/**
 * Operator notifications and the operator refresh check (DEC-080 §7.5, #436), shaped like
 * OperatorNotificationController and OperatorUpdatesController: an operator session, then 404 for a
 * missing event and 403 NOT_A_MEMBER without an operator row in the event.
 */
function open(eventId: string): { userId: string } | Response {
  const operator = currentOperator();
  if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
  if (!eventById(eventId)) return problem(404, "RESOURCE_NOT_FOUND", { detail: "hidden" });
  if (!eventRoleOf(eventId, operator.userId)) return problem(403, "NOT_A_MEMBER");
  return { userId: operator.userId };
}

export const notificationHandlers = [
  http.get("/api/v1/operator/events/:eventId/notifications", ({ request, params }) => {
    const eventId = String(params.eventId);
    const opened = open(eventId);
    if (opened instanceof Response) return opened;
    const url = new URL(request.url);
    const beforeText = url.searchParams.get("before");
    const limitText = url.searchParams.get("limit");
    const before = beforeText === null ? null : Number(beforeText);
    const limit = limitText === null ? 30 : Number(limitText);
    if (before !== null && (!Number.isInteger(before) || before < 1)) return problem(400, "VALIDATION_FAILED", { errors: [{ field: "before" }] });
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) return problem(400, "VALIDATION_FAILED", { errors: [{ field: "limit" }] });
    return HttpResponse.json(pageOf(eventId, opened.userId, before, limit), NO_STORE);
  }),

  http.post("/api/v1/operator/events/:eventId/notifications/read", async ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN");
    const eventId = String(params.eventId);
    const opened = open(eventId);
    if (opened instanceof Response) return opened;
    const unread = markRead(eventId, opened.userId, await request.json().catch(() => null));
    if (unread === null) return problem(400, "VALIDATION_FAILED", { errors: [{ field: "body" }] });
    return HttpResponse.json({ unreadCount: unread }, NO_STORE);
  }),

  http.get("/api/v1/operator/events/:eventId/updates", ({ params }) => {
    const eventId = String(params.eventId);
    const opened = open(eventId);
    if (opened instanceof Response) return opened;
    return HttpResponse.json(
      {
        notifications: summaryOf(eventId, opened.userId),
        notices: noticeBoardVersion(eventId),
        schedule: 0,
        checkIns: checkInValue(eventId),
        pollAfterSeconds: MOCK_OPERATOR_POLL_SECONDS,
        serverTime: new Date().toISOString(),
      },
      NO_STORE,
    );
  }),
];
