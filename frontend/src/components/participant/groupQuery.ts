import { useQuery } from "@tanstack/react-query";
import { getParticipantGroup } from "../../api/participantGroup";
import { queryKeys } from "../../api/queryKeys";
import { useSessionGuard } from "./sessionGuard";
import { participantCardQuery } from "./updateTargets";

/** The 내 조 read shared by the home card and the 내 조 tab: one request, one cache entry. Reloads on `updates.group`. */
export function useParticipantGroupQuery(eventId: string) {
  const query = useQuery({
    queryKey: queryKeys.participantGroup(eventId),
    queryFn: ({ signal }) => getParticipantGroup(signal),
    ...participantCardQuery,
  });
  useSessionGuard(query.error);
  return query;
}
