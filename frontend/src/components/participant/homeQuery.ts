import { useQuery } from "@tanstack/react-query";
import { getParticipantHome } from "../../api/participantHome";
import { queryKeys } from "../../api/queryKeys";
import { useSessionGuard } from "./sessionGuard";
import { participantCardQuery } from "./updateTargets";

/** `GET /participant/home`, shared by the shell (tabs) and the 행사 머리 card. Reloads on `updates.home`. */
export function useParticipantHomeQuery(eventId: string, enabled = true) {
  const query = useQuery({
    queryKey: queryKeys.participantHome(eventId),
    queryFn: ({ signal }) => getParticipantHome(signal),
    enabled,
    ...participantCardQuery,
    // The shell waits for the first answer; a card mounting after a failure must not start it over.
    retryOnMount: false,
  });
  useSessionGuard(query.error);
  return query;
}
