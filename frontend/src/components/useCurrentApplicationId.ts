import { useQuery } from "@tanstack/react-query";
import { getApplicationRevisions } from "../api/applications";
import { queryKeys } from "../api/queryKeys";

/** The participant's current application id, from the revisions; null while unknown. */
export function useCurrentApplicationId(eventId: string, applicationId: string, enabled: boolean): string | null {
  const revisions = useQuery({
    queryKey: queryKeys.applicationRevisions(eventId, applicationId),
    queryFn: ({ signal }) => getApplicationRevisions(eventId, applicationId, signal),
    enabled,
    retry: false,
  });
  return revisions.data?.[0]?.applicationId ?? null;
}
