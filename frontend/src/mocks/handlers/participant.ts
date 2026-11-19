import { http, HttpResponse } from "msw";
import { csrfMatches } from "../csrf";
import { markSubmitted, publicForm } from "../formStore";
import { eventById } from "../operatorStore";
import {
  changeParticipantPin,
  clearParticipant,
  currentParticipant,
  openParticipantSession,
  submitPublicApplication,
} from "../participantStore";
import { problem } from "../problem";

export const participantHandlers = [
  http.get("/api/v1/public/events/:eventId/forms/:formId", ({ params }) => {
    const eventId = String(params.eventId);
    if (!eventById(eventId)) return problem(404, "RESOURCE_NOT_FOUND", { detail: "hidden" });
    const form = publicForm(eventId, String(params.formId));
    if (!("fields" in form)) return problem(form.status, form.code, { detail: "hidden" });
    return HttpResponse.json({ formId: form.formId, fields: form.fields });
  }),
  http.post("/api/v1/public/events/:eventId/forms/:formId/applications", async ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const submitted = submitPublicApplication(String(params.eventId), String(params.formId), await readJson(request));
    if ("code" in submitted) return failure(submitted);
    if (!submitted.revised) markSubmitted(String(params.eventId), String(params.formId));
    return HttpResponse.json(submitted, { status: submitted.revised ? 200 : 201 });
  }),
  http.post("/api/v1/public/events/:eventId/participant-sessions", async ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const refused = openParticipantSession(String(params.eventId), await readJson(request));
    if (refused) return failure(refused);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/v1/participant/me", () => {
    const participant = currentParticipant();
    if (!participant) return problem(401, "AUTHENTICATION_REQUIRED", { detail: "hidden" });
    return HttpResponse.json(participant);
  }),
  http.put("/api/v1/participant/pin", async ({ request, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const refused = changeParticipantPin(await readJson(request));
    if (refused) return failure(refused);
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("/api/v1/participant/auth/logout", ({ request, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    clearParticipant();
    return new HttpResponse(null, { status: 204 });
  }),
];

function failure(refused: { status: number; code: string; retryAfterSeconds?: number }) {
  return problem(refused.status, refused.code, {
    detail: "hidden",
    ...(refused.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: refused.retryAfterSeconds }),
  });
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
