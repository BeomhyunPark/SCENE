import { http, HttpResponse } from "msw";
import { currentOperator } from "./session";
import { csrfMatches } from "../csrf";
import { problem } from "../problem";
import { retrospectiveText, saveRetrospectiveText } from "../retrospectiveStore";
import { unverified } from "../unverified";

const NOTE = "서버에 회고 저장 API가 없다";

export const retrospectiveHandlers = [
  unverified(
    http.get("/api/v1/operator/events/:eventId/retrospective", ({ params }) => {
      if (!currentOperator()) return problem(401, "AUTHENTICATION_REQUIRED");
      const text = retrospectiveText(String(params.eventId));
      if (text === null) return problem(404, "RESOURCE_NOT_FOUND");
      return HttpResponse.json({ text });
    }),
    NOTE,
  ),
  unverified(
    http.put("/api/v1/operator/events/:eventId/retrospective", async ({ request, params, cookies }) => {
      if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN");
      if (!currentOperator()) return problem(401, "AUTHENTICATION_REQUIRED");
      const body = await readJson(request);
      if (!isRecord(body) || typeof body.text !== "string") {
        return problem(400, "VALIDATION_FAILED", { errors: [{ field: "text" }] });
      }
      const text = body.text;
      saveRetrospectiveText(String(params.eventId), text);
      return HttpResponse.json({ text });
    }),
    NOTE,
  ),
];

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length === 0) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
