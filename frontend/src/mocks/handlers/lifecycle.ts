import { http, HttpResponse } from "msw";
import { currentOperator } from "./session";
import { csrfMatches } from "../csrf";
import { activateEvent, type FormFailure } from "../formStore";
import { operatorRequests } from "../operatorStore";
import { problem } from "../problem";

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
];

function fail(failure: FormFailure): Response {
  return problem(failure.status, failure.code, {
    errors: failure.errors,
    lifecycleVersion: failure.lifecycleVersion,
    currentStatus: failure.currentStatus,
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
