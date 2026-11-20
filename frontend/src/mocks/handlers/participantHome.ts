import { http, HttpResponse } from "msw";
import { csrfMatches } from "../csrf";
import { readHome, readUpdates } from "../participantFeedStore";
import { currentParticipant, readOwnApplication, reviseOwnApplication } from "../participantStore";
import { problem } from "../problem";

/** Shaped like participant-home-contract §3·§4 (B2) and api.md "참가자 신청" (A4). Session only; PUT needs CSRF. */
export const participantHomeHandlers = [
  http.get("/api/v1/participant/home", () => {
    const participant = currentParticipant();
    if (!participant) return problem(401, "AUTHENTICATION_REQUIRED", { detail: "hidden" });
    const home = readHome(participant.eventId, participant);
    if (!home) return problem(404, "RESOURCE_NOT_FOUND", { detail: "hidden" });
    return HttpResponse.json(home, { headers: { "Cache-Control": "no-store" } });
  }),
  http.get("/api/v1/participant/updates", () => {
    const participant = currentParticipant();
    if (!participant) return problem(401, "AUTHENTICATION_REQUIRED", { detail: "hidden" });
    return HttpResponse.json(readUpdates(participant.eventId, participant.participantId), {
      headers: { "Cache-Control": "no-store" },
    });
  }),
  http.get("/api/v1/participant/application", () => {
    const participant = currentParticipant();
    if (!participant) return problem(401, "AUTHENTICATION_REQUIRED", { detail: "hidden" });
    const application = readOwnApplication();
    if (!application) return problem(404, "RESOURCE_NOT_FOUND", { detail: "hidden" });
    return HttpResponse.json(application);
  }),
  http.put("/api/v1/participant/application", async ({ request, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const participant = currentParticipant();
    if (!participant) return problem(401, "AUTHENTICATION_REQUIRED", { detail: "hidden" });
    const text = await request.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = null;
    }
    const result = reviseOwnApplication(body);
    if ("code" in result) {
      return problem(result.status, result.code, {
        detail: "hidden",
        ...(result.revision === undefined ? {} : { revision: result.revision }),
      });
    }
    return HttpResponse.json(result);
  }),
];
