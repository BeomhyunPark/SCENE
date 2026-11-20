import type { QueryClient } from "@tanstack/react-query";
import type { LifecycleStatus } from "../api/events";

/**
 * Every screen that counts applicants reads again after a withdraw or a restore (DEC-084): the
 * table, the summary and details, the group board and publication, and check-in.
 */
export function refreshAfterStatusChange(queryClient: QueryClient, eventId: string) {
  for (const key of [
    ["events", eventId, "applications"],
    ["events", eventId, "group-board"],
    ["events", eventId, "groups"],
    ["events", eventId, "check-ins"],
  ]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

/** Why withdraw or restore is not offered, or null. Same rule as the server (DEC-084 §8). */
export function statusChangeBlocked(eventStatus: LifecycleStatus, mayWrite: boolean, pending: boolean): string | null {
  if (eventStatus === "ENDED" || eventStatus === "ARCHIVED") return "끝나거나 보관된 행사는 참가 상태를 바꿀 수 없어요.";
  if (pending) return null;
  if (!mayWrite) return "참가자 정보를 고칠 권한이 있는 운영자만 신청을 취소하거나 되돌릴 수 있어요.";
  return null;
}
