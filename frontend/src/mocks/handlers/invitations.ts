import { http, HttpResponse } from "msw";
import { currentOperator, currentSessionEmail } from "./session";
import { csrfMatches } from "../csrf";
import {
  createInvitation,
  judgeInvitation,
  pendingInvitations,
  resendInvitation,
  revokeInvitation,
  type InvitationFailure,
} from "../invitationStore";
import { operatorRequests } from "../operatorStore";
import { problem } from "../problem";

const DEFAULT_SIZE = 50;
const MAX_SIZE = 100;

/**
 * Invitation list, commands, preview, and accept, shaped like EventInvitationController. The link
 * is only in the create and resend bodies (DEC-060 Follow-up 2026-11-16).
 */
export const invitationHandlers = [
  http.get("/api/v1/operator/events/:eventId/invitations", ({ request, params }) => {
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const url = new URL(request.url);
    operatorRequests.push({ method: "GET", url: url.pathname + url.search });
    const rows = pendingInvitations(String(params.eventId), operator.userId);
    if (!Array.isArray(rows)) return fail(rows);
    const size = intParam(url, "size", DEFAULT_SIZE);
    if (size > MAX_SIZE) return problem(400, "PAGE_SIZE_EXCEEDED", { detail: "hidden" });
    const page = intParam(url, "page", 0);
    return HttpResponse.json({
      items: rows.slice(page * size, page * size + size),
      page: { number: page, size, totalItems: rows.length, totalPages: rows.length === 0 ? 0 : Math.ceil(rows.length / size) },
    });
  }),

  http.post("/api/v1/operator/events/:eventId/invitations", async ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const body = await readJson(request);
    operatorRequests.push({ method: "POST", url: new URL(request.url).pathname, body });
    const issued = createInvitation(String(params.eventId), operator.userId, body);
    if ("code" in issued) return fail(issued);
    return HttpResponse.json(issued);
  }),

  http.post("/api/v1/operator/events/:eventId/invitations/:invitationId/resend", ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    operatorRequests.push({ method: "POST", url: new URL(request.url).pathname });
    const issued = resendInvitation(String(params.eventId), operator.userId, String(params.invitationId));
    if ("code" in issued) return fail(issued);
    return HttpResponse.json(issued);
  }),

  http.delete("/api/v1/operator/events/:eventId/invitations/:invitationId", ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    operatorRequests.push({ method: "DELETE", url: new URL(request.url).pathname });
    const result = revokeInvitation(String(params.eventId), operator.userId, String(params.invitationId));
    if ("code" in result) return fail(result);
    return HttpResponse.json(result);
  }),

  http.post("/api/v1/operator/invitations/preview", async ({ request, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const body = await readJson(request);
    const token = typeof body === "object" && body !== null ? (body as Record<string, unknown>).token : undefined;
    const result = judgeInvitation(token, operator.userId, currentSessionEmail(), false);
    if ("code" in result) return fail(result);
    const { eventId, eventName, role, inviterName, expiresAt, outcome } = result;
    return HttpResponse.json({ eventId, eventName, role, inviterName, expiresAt, outcome });
  }),

  http.post("/api/v1/operator/invitations/accept", async ({ request, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const body = await readJson(request);
    const token = typeof body === "object" && body !== null ? (body as Record<string, unknown>).token : undefined;
    const result = judgeInvitation(token, operator.userId, currentSessionEmail(), true);
    if ("code" in result) return fail(result);
    return HttpResponse.json({ outcome: result.outcome, eventId: result.eventId, role: result.operatorRole ?? null });
  }),
];

function fail(failure: InvitationFailure): Response {
  return problem(failure.status, failure.code, { errors: failure.errors, detail: "hidden" });
}

function intParam(url: URL, name: string, fallback: number): number {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
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
