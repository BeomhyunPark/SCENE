import { http, HttpResponse } from "msw";
import { readParticipantGroup } from "../participantGroupStore";
import { currentParticipant } from "../participantStore";
import { problem } from "../problem";

/** Shaped like GET /api/v1/participant/group (#300): participant session only, no CSRF on GET. */
export const participantGroupHandlers = [
  http.get("/api/v1/participant/group", () => {
    const participant = currentParticipant();
    if (!participant) return problem(401, "AUTHENTICATION_REQUIRED", { detail: "hidden" });
    return HttpResponse.json(readParticipantGroup(participant.eventId, participant.participantId));
  }),
];
