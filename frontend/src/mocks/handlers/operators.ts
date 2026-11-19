import { http, HttpResponse } from "msw";
import { currentOperator } from "./session";
import { csrfMatches } from "../csrf";
import { problem } from "../problem";
import { operatorRequests } from "../operatorStore";
import {
  addOperatorByOwner,
  changeRoleByOwner,
  operatorsFor,
  permissionsFor,
  removeByOwner,
  replacePermissions,
  type TaskFailure,
} from "../taskStore";

export const operatorHandlers = [
  http.get("/api/v1/operator/events/:eventId/operators", ({ request, params }) => {
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const url = new URL(request.url);
    operatorRequests.push({ method: "GET", url: url.pathname + url.search });
    if (url.searchParams.has("sort")) {
      return problem(400, "VALIDATION_FAILED", { errors: [{ field: "sort" }], detail: "hidden" });
    }
    const rows = operatorsFor(String(params.eventId), operator.userId);
    if (isFailure(rows)) return fail(rows);
    const items = rows.map((row) => ({ userId: row.userId, displayName: row.displayName, role: row.role }));
    return HttpResponse.json({
      items,
      page: { number: 0, size: 50, totalItems: items.length, totalPages: items.length === 0 ? 0 : 1 },
    });
  }),

  http.post("/api/v1/operator/events/:eventId/operators", async ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const body: unknown = await request.json().catch(() => null);
    operatorRequests.push({ method: "POST", url: new URL(request.url).pathname, body });
    const row = addOperatorByOwner(String(params.eventId), operator.userId, body);
    if ("code" in row) return fail(row);
    return HttpResponse.json({ userId: row.userId, displayName: row.displayName, role: row.role });
  }),

  http.patch("/api/v1/operator/events/:eventId/operators/:userId", async ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const body: unknown = await request.json().catch(() => null);
    operatorRequests.push({ method: "PATCH", url: new URL(request.url).pathname, body });
    const row = changeRoleByOwner(String(params.eventId), operator.userId, String(params.userId), body);
    if ("code" in row) return fail(row);
    return HttpResponse.json({ userId: row.userId, displayName: row.displayName, role: row.role });
  }),

  http.delete("/api/v1/operator/events/:eventId/operators/:userId", ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    operatorRequests.push({ method: "DELETE", url: new URL(request.url).pathname });
    const failure = removeByOwner(String(params.eventId), operator.userId, String(params.userId));
    if (failure) return fail(failure);
    return new HttpResponse(null, { status: 200 });
  }),

  http.get("/api/v1/operator/events/:eventId/operators/:userId/permissions", ({ request, params }) => {
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    operatorRequests.push({ method: "GET", url: new URL(request.url).pathname });
    const body = permissionsFor(String(params.eventId), operator.userId, String(params.userId));
    if (isFailure(body)) return fail(body);
    return HttpResponse.json(body);
  }),

  http.put("/api/v1/operator/events/:eventId/operators/:userId/permissions", async ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const body: unknown = await request.json().catch(() => null);
    operatorRequests.push({ method: "PUT", url: new URL(request.url).pathname, body });
    const result = replacePermissions(String(params.eventId), operator.userId, String(params.userId), body);
    if (isFailure(result)) return fail(result);
    return HttpResponse.json(result);
  }),
];

function fail(failure: TaskFailure): Response {
  return problem(failure.status, failure.code, { detail: "hidden", ...(failure.errors ? { errors: failure.errors } : {}) });
}

function isFailure(value: object): value is TaskFailure {
  return "code" in value && "status" in value && !("userId" in value) && !("length" in value);
}
