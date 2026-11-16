import { http, HttpResponse } from "msw";
import { currentOperator } from "./session";
import { csrfMatches } from "../csrf";
import { problem } from "../problem";
import { readRetrospective, writeRetrospective, type RetrospectiveFailure } from "../retrospectiveStore";

/** Shaped like RetrospectiveController (#237). No longer marked unverified. */
export const retrospectiveHandlers = [
  http.get("/api/v1/operator/events/:eventId/retrospective", ({ params }) => {
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const result = readRetrospective(String(params.eventId), operator.userId);
    if ("code" in result) return fail(result);
    return HttpResponse.json(result);
  }),
  http.put("/api/v1/operator/events/:eventId/retrospective", async ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN");
    const operator = currentOperator();
    if (!operator) return problem(401, "AUTHENTICATION_REQUIRED");
    const result = writeRetrospective(String(params.eventId), operator.userId, await readJson(request));
    if ("code" in result) return fail(result);
    return HttpResponse.json(result);
  }),
];

function fail(failure: RetrospectiveFailure): Response {
  return problem(failure.status, failure.code, { errors: failure.errors, version: failure.version, detail: "hidden" });
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
