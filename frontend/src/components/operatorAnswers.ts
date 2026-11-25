import { useQuery } from "@tanstack/react-query";
import type { ApplicationDetail } from "../api/applications";
import type { EventDetail } from "../api/events";
import type { FormField } from "../api/forms";
import { getMyPermissions } from "../api/operators";
import { queryKeys } from "../api/queryKeys";
import { getMe } from "../api/session";

const CONSENT = "CONSENT";

/** What the detail shows after a save (DEC-088). */
export type EditNotice = { edited: "saved" | "unchanged" | "added" };

/**
 * The questions an operator answers for a participant (DEC-088 §2): hidden questions and consent
 * questions are left out (the server keeps their answers as they were), and only the name and the
 * phone stay required, so a 현장 등록 with unknown answers can still be saved.
 */
export function operatorFields(fields: FormField[]): FormField[] {
  return fields
    .filter((field) => !field.hidden && !(field.answerType === "YES_NO" && field.config.style === CONSENT))
    .map((field) => ({ ...field, required: field.systemKey === "NAME" || field.systemKey === "PHONE" }));
}

/** Whether the form has a consent question the operator cannot answer. */
export function hasConsent(fields: FormField[]): boolean {
  return fields.some((field) => !field.hidden && field.answerType === "YES_NO" && field.config.style === CONSENT);
}

/** The signed-in operator's effective permission keys for the event (empty while loading). */
export function useEffectivePermissions(eventId: string): { effective: string[]; pending: boolean } {
  const me = useQuery({ queryKey: queryKeys.me, queryFn: getMe });
  const permissions = useQuery({
    queryKey: queryKeys.permissions(eventId, me.data?.userId ?? ""),
    queryFn: () => getMyPermissions(eventId, me.data!.userId),
    enabled: Boolean(me.data?.userId),
  });
  return { effective: permissions.data?.effective ?? [], pending: me.isPending || permissions.isPending };
}

/** Why this operator cannot edit this application now, or null. */
export function editBlocked(event: EventDetail, application: ApplicationDetail, effective: string[]): string | null {
  if (!effective.includes("PARTICIPANT_WRITE")) return "신청을 고칠 권한이 없어요. 행사 소유자에게 요청해 주세요.";
  if (event.lifecycleStatus === "ARCHIVED") return "보관된 행사라 신청을 고칠 수 없어요.";
  if (application.status === "WITHDRAWN") return "취소된 신청이에요. 참가 현황의 취소 목록에서 되돌린 뒤 고쳐 주세요.";
  if (application.status !== "SUBMITTED") return "고치기 전의 신청이에요. 지금 신청에서 고쳐 주세요.";
  // The edit sends every answer; a withheld phone answer would be lost.
  if (application.answers.some((answer) => answer.contact && answer.value === null)) {
    return "연락처를 볼 권한이 없어 신청을 고칠 수 없어요. 연락처 보기 권한이 필요해요.";
  }
  return null;
}

/** Why this operator cannot add a participant now, or null. */
export function addBlocked(event: EventDetail, effective: string[]): string | null {
  if (!effective.includes("PARTICIPANT_WRITE")) return "참가자를 추가할 권한이 없어요. 행사 소유자에게 요청해 주세요.";
  if (event.lifecycleStatus === "ENDED") return "끝난 행사에는 참가자를 추가할 수 없어요.";
  if (event.lifecycleStatus === "ARCHIVED") return "보관된 행사에는 참가자를 추가할 수 없어요.";
  return null;
}
