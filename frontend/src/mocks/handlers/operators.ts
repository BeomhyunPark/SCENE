import { http, HttpResponse } from "msw";
import { currentOperator } from "./session";
import { problem } from "../problem";
import { operatorRequests } from "../operatorStore";
import { operatorsFor, permissionsFor, type TaskFailure } from "../taskStore";

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

  http.get("/api/v1/operator/events/:eventId/operators/:userId/permissions", ({ request, params }) => {
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    operatorRequests.push({ method: "GET", url: new URL(request.url).pathname });
    const body = permissionsFor(String(params.eventId), operator.userId, String(params.userId));
    if (isFailure(body)) return fail(body);
    return HttpResponse.json(body);
  }),
];

function fail(failure: TaskFailure): Response {
  return problem(failure.status, failure.code, { detail: "hidden" });
}

function isFailure(value: object): value is TaskFailure {
  return "code" in value && "status" in value && !("userId" in value) && !("length" in value);
}
