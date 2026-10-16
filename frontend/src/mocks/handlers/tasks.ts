import { http, HttpResponse } from "msw";
import { currentOperator } from "./session";
import { csrfMatches } from "../csrf";
import { problem } from "../problem";
import { operatorRequests } from "../operatorStore";
import {
  completeTask,
  createTask,
  patchTask,
  removeTask,
  reopenTask,
  setChecked,
  taskDetail,
  tasksFor,
  type TaskFailure,
} from "../taskStore";

const PAGE_SIZE = 50;

export const taskHandlers = [
  http.get("/api/v1/operator/events/:eventId/tasks", ({ request, params }) => {
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const url = new URL(request.url);
    operatorRequests.push({ method: "GET", url: url.pathname + url.search });
    if (url.searchParams.has("sort")) {
      return problem(400, "VALIDATION_FAILED", { errors: [{ field: "sort" }], detail: "hidden" });
    }
    const result = tasksFor(String(params.eventId), operator.userId);
    if (isFailure(result)) return fail(result);
    const page = numberParam(url, "page");
    const start = page * PAGE_SIZE;
    const slice = result.slice(start, start + PAGE_SIZE);
    const totalPages = result.length === 0 ? 0 : Math.ceil(result.length / PAGE_SIZE);
    return HttpResponse.json({
      items: slice,
      page: { number: page, size: PAGE_SIZE, totalItems: result.length, totalPages },
    });
  }),

  http.post("/api/v1/operator/events/:eventId/tasks", async ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const body = await readJson(request);
    operatorRequests.push({ method: "POST", url: new URL(request.url).pathname, body });
    if (!isRecord(body)) return fail({ status: 400, code: "VALIDATION_FAILED", errors: [{ field: "title" }] });
    const created = createTask(String(params.eventId), operator.userId, body);
    if (isFailure(created)) return fail(created);
    operatorRequests[operatorRequests.length - 1].response = created;
    return HttpResponse.json(created, { status: 201 });
  }),

  http.get("/api/v1/operator/events/:eventId/tasks/:taskId", ({ request, params }) => {
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    operatorRequests.push({ method: "GET", url: new URL(request.url).pathname });
    const detail = taskDetail(String(params.eventId), String(params.taskId), operator.userId);
    if (isFailure(detail)) return fail(detail);
    return HttpResponse.json(detail);
  }),

  http.patch("/api/v1/operator/events/:eventId/tasks/:taskId", async ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const body = await readJson(request);
    operatorRequests.push({ method: "PATCH", url: new URL(request.url).pathname, body });
    if (!isRecord(body)) return fail({ status: 400, code: "VALIDATION_FAILED" });
    const updated = patchTask(String(params.eventId), String(params.taskId), operator.userId, body);
    if (isFailure(updated)) return fail(updated);
    return HttpResponse.json(updated);
  }),

  http.delete("/api/v1/operator/events/:eventId/tasks/:taskId", ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    operatorRequests.push({ method: "DELETE", url: new URL(request.url).pathname });
    const removed = removeTask(String(params.eventId), String(params.taskId), operator.userId);
    if (removed) return fail(removed);
    return new HttpResponse(null, { status: 204 });
  }),

  http.put(
    "/api/v1/operator/events/:eventId/tasks/:taskId/items/:itemId",
    async ({ request, params, cookies }) => {
      if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
      const operator = currentOperator();
      if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
      const body = await readJson(request);
      operatorRequests.push({ method: "PUT", url: new URL(request.url).pathname, body });
      if (!isRecord(body) || typeof body.checked !== "boolean") {
        return fail({ status: 400, code: "VALIDATION_FAILED", errors: [{ field: "checked" }] });
      }
      const updated = setChecked(
        String(params.eventId),
        String(params.taskId),
        String(params.itemId),
        operator.userId,
        body.checked,
      );
      if (isFailure(updated)) return fail(updated);
      return HttpResponse.json(updated);
    },
  ),

  http.post("/api/v1/operator/events/:eventId/tasks/:taskId/complete", async ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const body = await readJson(request);
    operatorRequests.push({ method: "POST", url: new URL(request.url).pathname, body });
    const version = isRecord(body) && typeof body.version === "number" ? body.version : null;
    const updated = completeTask(String(params.eventId), String(params.taskId), operator.userId, version);
    if (isFailure(updated)) return fail(updated);
    return HttpResponse.json(updated);
  }),

  http.post("/api/v1/operator/events/:eventId/tasks/:taskId/reopen", async ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const body = await readJson(request);
    operatorRequests.push({ method: "POST", url: new URL(request.url).pathname, body });
    const version = isRecord(body) && typeof body.version === "number" ? body.version : null;
    const reason = isRecord(body) && typeof body.reason === "string" ? body.reason : null;
    const updated = reopenTask(String(params.eventId), String(params.taskId), operator.userId, version, reason);
    if (isFailure(updated)) return fail(updated);
    return HttpResponse.json(updated);
  }),
];

function fail(failure: TaskFailure): Response {
  return problem(failure.status, failure.code, {
    errors: failure.errors,
    reason: failure.reason,
    task: failure.task,
    eventStatus: failure.eventStatus,
    detail: "hidden",
  });
}

function isFailure(value: object): value is TaskFailure {
  return "code" in value && "status" in value && !("taskId" in value);
}

function numberParam(url: URL, name: string): number {
  const raw = url.searchParams.get(name);
  const value = raw === null ? 0 : Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return (await request.json()) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
