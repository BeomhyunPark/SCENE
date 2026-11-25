import { useQuery } from "@tanstack/react-query";
import { getParticipantRooms } from "../../api/participantRooms";
import { queryKeys } from "../../api/queryKeys";
import { useSessionGuard } from "./sessionGuard";
import { participantCardQuery } from "./updateTargets";

/**
 * The 숙소 read shared by the home card and the 숙소 screen: one request, one cache entry under
 * `queryKeys.participantRooms(eventId)`. It reloads only when `updates.rooms` changes (`UPDATE_TARGETS`).
 */
export function useParticipantRoomsQuery(eventId: string) {
  const query = useQuery({
    queryKey: queryKeys.participantRooms(eventId),
    queryFn: ({ signal }) => getParticipantRooms(signal),
    ...participantCardQuery,
  });
  useSessionGuard(query.error);
  return query;
}
