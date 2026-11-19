import { http, HttpResponse } from "msw";
import { currentOperator, currentSessionEmail } from "./session";
import { csrfMatches } from "../csrf";
import { operatorRequests } from "../operatorStore";
import { problem } from "../problem";
import {
  createSpaceInvitation,
  judgeSpaceInvitation,
  pendingSpaceInvitations,
  resendSpaceInvitation,
  revokeSpaceInvitation,
  spaceMembers,
  type SpaceInvitationFailure,
} from "../spaceInvitationStore";

const DEFAULT_SIZE = 50;
const MAX_SIZE = 100;

/**
 * Space invitations and members, shaped like SpaceInvitationController (DEC-076, #361). The link
 * is only in the create and resend bodies, and its token starts with "s.".
 */
export const spaceInvitationHandlers = [
  http.get("/api/v1/operator/spaces/:spaceId/members", ({ request, params }) => {
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const url = new URL(request.url);
    operatorRequests.push({ method: "GET", url: url.pathname + url.search });
    if (url.searchParams.has("sort")) return problem(400, "VALIDATION_FAILED", { errors: [{ field: "sort" }] });
    const rows = spaceMembers(String(params.spaceId), operator.userId);
    if (!Array.isArray(rows)) return fail(rows);
    return page(url, rows);
  }),

  http.get("/api/v1/operator/spaces/:spaceId/invitations", ({ request, params }) => {
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const url = new URL(request.url);
    operatorRequests.push({ method: "GET", url: url.pathname + url.search });
    const rows = pendingSpaceInvitations(String(params.spaceId), operator.userId);
    if (!Array.isArray(rows)) return fail(rows);
    return page(url, rows);
  }),

  http.post("/api/v1/operator/spaces/:spaceId/invitations", async ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const body = await readJson(request);
    operatorRequests.push({ method: "POST", url: new URL(request.url).pathname, body });
    const issued = createSpaceInvitation(String(params.spaceId), operator.userId, body);
    if ("code" in issued) return fail(issued);
    return HttpResponse.json(issued);
  }),

  http.post("/api/v1/operator/spaces/:spaceId/invitations/:invitationId/resend", ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    operatorRequests.push({ method: "POST", url: new URL(request.url).pathname });
    const issued = resendSpaceInvitation(String(params.spaceId), operator.userId, String(params.invitationId));
    if ("code" in issued) return fail(issued);
    return HttpResponse.json(issued);
  }),

  http.delete("/api/v1/operator/spaces/:spaceId/invitations/:invitationId", ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    operatorRequests.push({ method: "DELETE", url: new URL(request.url).pathname });
    const result = revokeSpaceInvitation(String(params.spaceId), operator.userId, String(params.invitationId));
    if ("code" in result) return fail(result);
    return HttpResponse.json(result);
  }),

  http.post("/api/v1/operator/space-invitations/preview", async ({ request, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const token = readToken(await readJson(request));
    operatorRequests.push({ method: "POST", url: new URL(request.url).pathname });
    const result = judgeSpaceInvitation(token, operator.userId, currentSessionEmail(), false);
    if ("code" in result) return fail(result);
    const { spaceName, role, inviterName, expiresAt, outcome } = result;
    return HttpResponse.json({ spaceName, role, inviterName, expiresAt, outcome });
  }),

  http.post("/api/v1/operator/space-invitations/accept", async ({ request, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const token = readToken(await readJson(request));
    operatorRequests.push({ method: "POST", url: new URL(request.url).pathname });
    const result = judgeSpaceInvitation(token, operator.userId, currentSessionEmail(), true);
    if ("code" in result) return fail(result);
    return HttpResponse.json({ outcome: result.outcome, spaceId: result.spaceId });
  }),
];

function page<T>(url: URL, rows: T[]): Response {
  const size = intParam(url, "size", DEFAULT_SIZE);
  if (size > MAX_SIZE) return problem(400, "PAGE_SIZE_EXCEEDED", { detail: "hidden" });
  const number = intParam(url, "page", 0);
  return HttpResponse.json({
    items: rows.slice(number * size, number * size + size),
    page: {
      number,
      size,
      totalItems: rows.length,
      totalPages: rows.length === 0 ? 0 : Math.ceil(rows.length / size),
    },
  });
}

function fail(failure: SpaceInvitationFailure): Response {
  return problem(failure.status, failure.code, { errors: failure.errors, detail: "hidden" });
}

function readToken(body: unknown): unknown {
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>).token : undefined;
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
