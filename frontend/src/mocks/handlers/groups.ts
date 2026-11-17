import { http, HttpResponse } from "msw";
import { csrfMatches } from "../csrf";
import {
  assign,
  createGroup,
  deleteGroup,
  publish,
  readBoard,
  readPublishedGroups,
  renameGroup,
  reorderGroups,
  setLeaders,
  type GroupFailure,
} from "../groupStore";
import { problem } from "../problem";
import { currentOperator } from "./session";

/** Shaped like GroupController (#299), the publish of #300 and the operator published read (#288). */
const base = "/api/v1/operator/events/:eventId";

export const groupHandlers = [
  http.get(`${base}/group-board`, ({ params }) => {
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    return reply(readBoard(String(params.eventId), operator.userId));
  }),
  http.get(`${base}/groups/published`, ({ params }) => {
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    return reply(readPublishedGroups(String(params.eventId), operator.userId));
  }),
  http.post(`${base}/groups`, async ({ params, request, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN");
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    return reply(createGroup(String(params.eventId), operator.userId, await readJson(request)), 201);
  }),
  // Registered before `groups/:groupId` so "order" and "publish" are not read as a group id.
  http.post(`${base}/groups/publish`, async ({ params, request, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN");
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    return reply(publish(String(params.eventId), operator.userId, await readJson(request)));
  }),
  http.put(`${base}/groups/order`, async ({ params, request, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN");
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    return reply(reorderGroups(String(params.eventId), operator.userId, await readJson(request)));
  }),
  http.patch(`${base}/groups/:groupId`, async ({ params, request, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN");
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    return reply(renameGroup(String(params.eventId), String(params.groupId), operator.userId, await readJson(request)));
  }),
  http.delete(`${base}/groups/:groupId`, ({ params, request, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN");
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    return reply(deleteGroup(String(params.eventId), String(params.groupId), operator.userId, new URL(request.url)));
  }),
  http.put(`${base}/groups/:groupId/leaders`, async ({ params, request, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN");
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    return reply(setLeaders(String(params.eventId), String(params.groupId), operator.userId, await readJson(request)));
  }),
  http.post(`${base}/group-assignments`, async ({ params, request, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN");
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    return reply(assign(String(params.eventId), operator.userId, await readJson(request)));
  }),
];

function reply(result: object, status = 200): Response {
  if (isFailure(result)) {
    return problem(result.status, result.code, {
      errors: result.errors,
      version: result.version,
      boardVersion: result.boardVersion,
      conflicts: result.conflicts,
      reason: result.reason,
      participantIds: result.participantIds,
      unassignedCount: result.unassignedCount,
      detail: "hidden",
    });
  }
  return HttpResponse.json(result, { status });
}

function isFailure(value: object): value is GroupFailure {
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
