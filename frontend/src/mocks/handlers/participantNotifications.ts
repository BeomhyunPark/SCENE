import { http, HttpResponse } from "msw";
import { csrfMatches } from "../csrf";
import { participantNotificationPage, readParticipantNotifications } from "../participantNotificationStore";
import { currentParticipant } from "../participantStore";
import { problem } from "../problem";

const NO_STORE = { headers: { "Cache-Control": "no-store" } };

/**
 * Shaped like ParticipantNotificationController (DEC-080 §7.4, api.md "참가자 알림", B5 #463):
 * participant session, `no-store`, POST needs CSRF, `400 VALIDATION_FAILED` names the field.
 */
export const participantNotificationHandlers = [
  http.get("/api/v1/participant/notifications", ({ request }) => {
    const participant = currentParticipant();
    if (!participant) return problem(401, "AUTHENTICATION_REQUIRED", { detail: "hidden" });
    const page = participantNotificationPage(participant.participantId, new URL(request.url).searchParams);
    if ("code" in page) return problem(400, "VALIDATION_FAILED", { errors: page.errors });
    return HttpResponse.json(page, NO_STORE);
  }),
  http.post("/api/v1/participant/notifications/read", async ({ request, cookies }) => {
    if (!csrfMatches(request, cookies)) return problem(403, "FORBIDDEN", { detail: "hidden" });
    const participant = currentParticipant();
    if (!participant) return problem(401, "AUTHENTICATION_REQUIRED", { detail: "hidden" });
    const body = await request.json().catch(() => null);
    const result = readParticipantNotifications(participant.participantId, body);
    if ("code" in result) return problem(400, "VALIDATION_FAILED", { errors: result.errors });
    return HttpResponse.json(result, NO_STORE);
  }),
];
