import { useQuery } from "@tanstack/react-query";
import { isApiError } from "../api/errors";
import type { LifecycleStatus } from "../api/events";
import { getMyPermissions } from "../api/operators";
import { queryKeys } from "../api/queryKeys";
import { CATEGORY_LABEL, getScheduleBoard, type ScheduleBoard, type ScheduleChanges, type ScheduleItem, type SchedulePublishResult } from "../api/schedule";
import { getMe } from "../api/session";

/**
 * Shared by the 일정표 board and the item editor (C4). The board is read on entering, on window focus
 * (React Query's default) and after each write. The operator `updates` poll (I3) is not on main yet;
 * once it is, raising `updates.schedule` should invalidate `queryKeys.scheduleBoard(eventId)`.
 */
export function useScheduleBoard(eventId: string) {
  return useQuery({
    queryKey: queryKeys.scheduleBoard(eventId),
    queryFn: ({ signal }) => getScheduleBoard(eventId, signal),
    retry: (count, error) => !(isApiError(error) && error.status < 500) && count < 2,
  });
}

/** Same way as 조 편성: the screen asks for my effective permissions and looks for SCHEDULE_WRITE. */
export function useScheduleWrite(eventId: string): { mayWrite: boolean; pending: boolean } {
  const me = useQuery({ queryKey: queryKeys.me, queryFn: getMe });
  const permissions = useQuery({
    queryKey: queryKeys.permissions(eventId, me.data?.userId ?? ""),
    queryFn: () => getMyPermissions(eventId, me.data!.userId),
    enabled: Boolean(me.data?.userId),
    retry: false,
  });
  return {
    mayWrite: permissions.data?.effective.includes("SCHEDULE_WRITE") ?? false,
    pending: me.isPending || (permissions.isPending && Boolean(me.data?.userId)),
  };
}

/** Why this screen cannot write, or null. Reading is never blocked by the event state. */
export function writeBlocked(board: Pick<ScheduleBoard, "eventStatus" | "days">, mayWrite: boolean, pending: boolean): string | null {
  const status: LifecycleStatus = board.eventStatus;
  if (status === "ENDED") return "종료된 행사라 일정을 바꿀 수 없어요. 일정표는 볼 수 있어요.";
  if (status === "ARCHIVED") return "보관된 행사라 일정을 바꿀 수 없어요. 일정표는 읽기 전용이에요.";
  if (pending) return null;
  if (!mayWrite) return "일정 쓰기 권한이 없어 일정표만 볼 수 있어요. 행사 OWNER에게 권한을 요청해 주세요.";
  return null;
}

/** Failures every schedule write can meet. */
export function commonFailure(error: unknown): string | null {
  if (isApiError(error, "EVENT_ENDED")) return "종료된 행사라 저장하지 않았어요.";
  if (isApiError(error, "EVENT_ARCHIVED")) return "보관된 행사라 저장하지 않았어요.";
  if (isApiError(error, "FORBIDDEN")) return "일정 쓰기 권한이 없어 저장하지 않았어요.";
  if (isApiError(error, "NETWORK_ERROR", "UNEXPECTED") || (isApiError(error) && error.status >= 500)) {
    return "결과를 확인하지 못했어요. 일정표를 다시 불러왔으니 반영됐는지 확인해 주세요.";
  }
  return null;
}

export function categoryLabel(item: Pick<ScheduleItem, "category">): string {
  return CATEGORY_LABEL[item.category];
}

/** "09:30–11:00", "22:00–00:30 (다음 날)", or "09:30". */
export function itemTime(item: Pick<ScheduleItem, "startTime" | "endTime" | "endsNextDay">): string {
  if (!item.endTime) return item.startTime;
  return `${item.startTime}–${item.endTime}${item.endsNextDay ? " (다음 날)" : ""}`;
}

export function changesLine(changes: ScheduleChanges): string {
  return `추가 ${changes.added.length} · 변경 ${changes.changed.length} · 삭제 ${changes.removed.length}`;
}

/** The short report after a publish ("공개 결과를 짧게"). */
export function publishedText(result: SchedulePublishResult, notify: boolean, lead: string): string {
  if (result.result === "ALREADY_PUBLISHED") return `${lead} 공개된 내용과 같아 새로 공개하지 않았어요.`;
  const notified = notify ? ` · 알림 ${result.notifiedCount}명` : " · 알림 보내지 않음";
  return `${lead} ${changesLine(result.changes)}${notified}`;
}
