import { http, HttpResponse } from "msw";
import { readParticipantRooms } from "../participantRoomStore";
import { currentParticipant } from "../participantStore";
import { problem } from "../problem";

/** Shaped like GET /api/v1/participant/rooms (api.md "숙소", #459): participant session only, no CSRF on GET. */
export const participantRoomHandlers = [
  http.get("/api/v1/participant/rooms", () => {
    const participant = currentParticipant();
    if (!participant) return problem(401, "AUTHENTICATION_REQUIRED", { detail: "hidden" });
    return HttpResponse.json(readParticipantRooms(participant.eventId, participant.participantId), {
      headers: { "Cache-Control": "no-store" },
    });
  }),
];
