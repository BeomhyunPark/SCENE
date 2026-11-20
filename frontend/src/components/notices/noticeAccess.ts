import { useQuery } from "@tanstack/react-query";
import type { EventDetail } from "../../api/events";
import { getMyPermissions } from "../../api/operators";
import { queryKeys } from "../../api/queryKeys";
import { getMe } from "../../api/session";

/**
 * Who may write notices here, the same way the other operator screens decide (my effective keys).
 * `NOTICE_WRITE` writes; an ARCHIVED event reads only; ENDED still writes (follow-up notices, DEC-051).
 * The server stays the judge: a `403` or `409 EVENT_ARCHIVED` is still handled where it lands.
 */
export function useNoticeAccess(event: EventDetail): { canWrite: boolean; pending: boolean; readOnlyNote: string | null } {
  const me = useQuery({ queryKey: queryKeys.me, queryFn: getMe });
  const permissions = useQuery({
    queryKey: queryKeys.permissions(event.eventId, me.data?.userId ?? ""),
    queryFn: () => getMyPermissions(event.eventId, me.data!.userId),
    enabled: Boolean(me.data?.userId),
  });
  const mayWrite = permissions.data?.effective.includes("NOTICE_WRITE") ?? false;
  const archived = event.lifecycleStatus === "ARCHIVED";
  const pending = me.isPending || permissions.isPending;
  let readOnlyNote: string | null = null;
  if (archived) readOnlyNote = "보관된 행사라 공지를 읽기만 할 수 있어요.";
  else if (!pending && !mayWrite) readOnlyNote = "공지를 쓸 권한이 없어 읽기만 할 수 있어요.";
  return { canWrite: mayWrite && !archived, pending, readOnlyNote };
}
