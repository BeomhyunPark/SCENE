import { useQuery } from "@tanstack/react-query";
import { getGroupMemberDetail, getParticipantGroup } from "../../api/participantGroup";
import { queryKeys } from "../../api/queryKeys";
import { useSessionGuard } from "./sessionGuard";
import { participantCardQuery } from "./updateTargets";

/** 조원 현황 reads again every 60 s while it is on screen (F3); TanStack skips the interval while the page is hidden. */
export const LEADER_REFRESH_MS = 60_000;

/**
 * The 내 조 read shared by the home card and the 내 조 tab: one request, one cache entry. Reloads on
 * `updates.group`. `leaderRefresh` is set by the 내 조 tab only, so the home card never polls.
 */
export function useParticipantGroupQuery(eventId: string, options: { leaderRefresh?: boolean } = {}) {
  const query = useQuery({
    queryKey: queryKeys.participantGroup(eventId),
    queryFn: ({ signal }) => getParticipantGroup(signal),
    ...participantCardQuery,
    refetchInterval: (current) =>
      options.leaderRefresh && current.state.data?.leader ? LEADER_REFRESH_MS : false,
    refetchIntervalInBackground: false,
  });
  useSessionGuard(query.error);
  return query;
}

/**
 * One member's detail for the leader (DEC-083 §3). Read once when it opens: no interval, no focus or
 * reconnect reads, no retry, and nothing kept after it closes, so a phone number does not stay in the
 * cache and every read the server logs is one the leader asked for.
 */
export function useGroupMemberQuery(eventId: string, participantId: string) {
  const query = useQuery({
    queryKey: queryKeys.participantGroupMember(eventId, participantId),
    // No abort signal: a read that reached the server is already logged, and cancelling it on a quick
    // unmount/remount (StrictMode in dev, a fast back-and-forth) would only send a second logged read.
    queryFn: () => getGroupMemberDetail(participantId),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  useSessionGuard(query.error);
  return query;
}
