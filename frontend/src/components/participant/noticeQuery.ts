import { useInfiniteQuery, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { listParticipantNotices, type ParticipantNoticePage } from "../../api/notices";
import { queryKeys } from "../../api/queryKeys";
import { useSessionGuard } from "./sessionGuard";
import { participantCardQuery } from "./updateTargets";

/**
 * Notice reads sit under `queryKeys.participantNotices(eventId)`, so `updates.notices` and
 * `updates.group` (a leader change) reload them (updateTargets.ts). The home card and the tab share
 * the list's first page: one request. Nothing here polls the notice routes; `updates` is the signal.
 */
export const participantNoticeList = (eventId: string) => [...queryKeys.participantNotices(eventId), "list"] as const;
export const participantNoticeDetail = (eventId: string, noticeId: string) =>
  [...queryKeys.participantNotices(eventId), "detail", noticeId] as const;

export function useParticipantNoticeList(eventId: string) {
  const query = useInfiniteQuery({
    queryKey: participantNoticeList(eventId),
    queryFn: ({ pageParam, signal }) => listParticipantNotices({ before: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    ...participantCardQuery,
  });
  useSessionGuard(query.error);
  return query;
}

/** After the detail marks its notifications read, drop "새 공지" from the cached list without a reload. */
export function markReadInList(queryClient: QueryClient, eventId: string, noticeId: string): void {
  queryClient.setQueryData<InfiniteData<ParticipantNoticePage>>(participantNoticeList(eventId), (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((item) => (item.noticeId === noticeId ? { ...item, unread: false } : item)),
          })),
        }
      : data,
  );
}
