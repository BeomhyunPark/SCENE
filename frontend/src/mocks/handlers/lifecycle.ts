import { http, HttpResponse } from "msw";
import { currentOperator } from "./session";
import { csrfMatches } from "../csrf";
import { activateEvent, endEvent, type FormFailure } from "../formStore";
import { operatorRequests } from "../operatorStore";
import { problem } from "../problem";
import { tasksFor } from "../taskStore";

export const lifecycleHandlers = [
  http.post("/api/v1/operator/events/:eventId/activate", async ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const body = await readJson(request);
    operatorRequests.push({ method: "POST", url: new URL(request.url).pathname, body });
    const result = activateEvent(String(params.eventId), operator.userId, body);
    if (isFailure(result)) return fail(result);
    return HttpResponse.json(result);
  }),
  http.post("/api/v1/operator/events/:eventId/end", async ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const body = await readJson(request);
    operatorRequests.push({ method: "POST", url: new URL(request.url).pathname, body });
    const eventId = String(params.eventId);
    const tasks = tasksFor(eventId, operator.userId);
    const openTasks = Array.isArray(tasks) ? tasks.filter((task) => task.status === "TODO" || task.status === "DOING").length : 0;
    const result = endEvent(eventId, operator.userId, body, openTasks);
    if (isFailure(result)) return fail(result);
    return HttpResponse.json(result);
  }),
];

function fail(failure: FormFailure): Response {
  return problem(failure.status, failure.code, {
    errors: failure.errors,
    lifecycleVersion: failure.lifecycleVersion,
    currentStatus: failure.currentStatus,
    warnings: failure.warnings,
    detail: "hidden",
  });
}

function isFailure(value: object): value is FormFailure {
  return "status" in value && "code" in value && !("outcome" in value);
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
