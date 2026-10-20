import { http, HttpResponse } from "msw";
import { csrfMatches } from "../csrf";
import { publicForm } from "../formStore";
import { eventById } from "../operatorStore";
import {
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
    if ("code" in submitted) return problem(submitted.status, submitted.code, { detail: "hidden" });
    return HttpResponse.json(submitted, { status: 201 });
  }),
  http.post("/api/v1/public/events/:eventId/participant-sessions", async ({ request, params, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const failure = openParticipantSession(String(params.eventId), await readJson(request));
    if (failure) return problem(failure.status, failure.code, { detail: "hidden" });
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/v1/participant/me", () => {
    const participant = currentParticipant();
    if (!participant) return problem(401, "AUTHENTICATION_REQUIRED", { detail: "hidden" });
    return HttpResponse.json(participant);
  }),
  http.post("/api/v1/participant/auth/logout", ({ request, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    clearParticipant();
    return new HttpResponse(null, { status: 204 });
  }),
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
