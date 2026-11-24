import { http, HttpResponse } from "msw";
import { readGroupMember, readParticipantGroup } from "../groupStore";
import { currentParticipant } from "../participantStore";
import { problem } from "../problem";

/**
 * Shaped like GET /api/v1/participant/group (#300, DEC-083) and the leader's member detail (#452):
 * participant session only, no CSRF on GET. Every refusal of the detail is the same 404.
 */
export const participantGroupHandlers = [
  http.get("/api/v1/participant/group", () => {
    const participant = currentParticipant();
    if (!participant) return problem(401, "AUTHENTICATION_REQUIRED", { detail: "hidden" });
    return HttpResponse.json(readParticipantGroup(participant.eventId, participant.participantId));
  }),
  http.get("/api/v1/participant/group/members/:participantId", ({ params }) => {
    const participant = currentParticipant();
    if (!participant) return problem(401, "AUTHENTICATION_REQUIRED", { detail: "hidden" });
    const member = readGroupMember(participant.eventId, participant.participantId, String(params.participantId));
    if (!member) return problem(404, "RESOURCE_NOT_FOUND", { detail: "hidden" });
    return HttpResponse.json(member, { headers: { "Cache-Control": "no-store" } });
  }),
];
