import { http, HttpResponse } from "msw";
import { currentOperator } from "./session";
import { csrfMatches } from "../csrf";
import { problem } from "../problem";
import { applyRosterSheet, readRosterSheet, type RosterSheetFailure } from "../rosterSheetStore";

/** Shaped like RosterSheetController (#508). */
export const rosterSheetHandlers = [
  http.get("/api/v1/operator/events/:eventId/roster-sheet", ({ params }) => {
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const result = readRosterSheet(String(params.eventId), operator.userId);
    if ("code" in result) return fail(result);
    return HttpResponse.json(result);
  }),
  http.post("/api/v1/operator/events/:eventId/roster-sheet/ops", async ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN");
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    const result = applyRosterSheet(String(params.eventId), operator.userId, body);
    if ("code" in result) return fail(result);
    return HttpResponse.json(result);
  }),
];

function fail(failure: RosterSheetFailure): Response {
  return problem(failure.status, failure.code, { errors: failure.errors, detail: "hidden" });
}
