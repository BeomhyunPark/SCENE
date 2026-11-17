import { http, HttpResponse } from "msw";
import { readParticipantCheckIn } from "../participantCheckInStore";
import { currentParticipant } from "../participantStore";
import { problem } from "../problem";

/** Shaped like ParticipantCheckInController (#283): participant session only, no CSRF on GET. */
export const participantCheckInHandlers = [
  http.get("/api/v1/participant/check-in", async () => {
    const participant = currentParticipant();
    if (!participant) return problem(401, "AUTHENTICATION_REQUIRED", { detail: "hidden" });
    const result = await readParticipantCheckIn(participant.eventId, participant.participantId);
    if ("failure" in result) return problem(result.failure.status, result.failure.code, { detail: "hidden" });
    return HttpResponse.json(result);
  }),
];
