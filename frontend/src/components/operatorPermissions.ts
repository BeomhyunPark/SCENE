/**
 * Permission keys the event OWNER can turn on or off for one operator (DEC-079). Only the keys the
 * retreat uses are shown, in plain words. Other keys keep their stored overrides untouched.
 * EVENT_READ (never removable) and the owner-only EVENT_LIFECYCLE and EVENT_USER_MANAGE are not
 * in the list; the server rejects them with 422 (DEC-029, DEC-031).
 */
export type PermissionItem = { key: string; label: string; hint: string };
export type PermissionGroup = { title: string; items: PermissionItem[] };

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    title: "참가자",
    items: [
      { key: "PARTICIPANT_CONTACT_READ", label: "연락처 보기", hint: "신청 상세에서 전화번호를 봐요" },
      { key: "PARTICIPANT_WRITE", label: "참가자 정보 수정", hint: "운영 메모를 쓰고 참가자 정보를 고쳐요" },
      { key: "DATA_EXPORT", label: "명단 내려받기", hint: "신청자 명단을 CSV로 내려받아요" },
    ],
  },
  {
    title: "현장 운영",
    items: [
      { key: "GROUP_WRITE", label: "조 편성", hint: "편성판에서 조를 짜고 공개해요" },
      { key: "ROOM_WRITE", label: "숙소 배정", hint: "숙소 기능이 열리면 방을 배정해요" },
      { key: "CHECKIN_WRITE", label: "체크인", hint: "현장에서 도착을 확인해요" },
      { key: "TASK_WRITE", label: "준비 업무", hint: "준비 업무를 만들고 고쳐요" },
    ],
  },
  {
    title: "안내",
    items: [
      { key: "SCHEDULE_WRITE", label: "일정 쓰기", hint: "일정표 기능이 열리면 일정을 고쳐요" },
      { key: "NOTICE_WRITE", label: "공지 쓰기", hint: "공지 기능이 열리면 공지를 올려요" },
    ],
  },
  {
    title: "행사 설정",
    items: [
      { key: "FORM_WRITE", label: "신청서 고치기", hint: "신청서 질문과 설정을 고쳐요" },
      { key: "EVENT_UPDATE", label: "행사 정보 고치기", hint: "행사 이름과 회고를 고쳐요" },
    ],
  },
];

/**
 * What each role does by default, in one line (DEC-079 Follow-up 2026-11-20). MANAGER has every key
 * but the OWNER-only ones; STAFF checks in and reads. The editor itself draws from the server's
 * roleDefaults, so this text is only the summary shown where a role is picked.
 */
export const ROLE_SUMMARY: Record<"MANAGER" | "STAFF", string> = {
  MANAGER: "행사 시작·종료와 운영 멤버 관리만 빼고 모두 할 수 있어요",
  STAFF: "체크인과 보기만 할 수 있어요",
};

export const EDITABLE_KEYS = PERMISSION_GROUPS.flatMap((group) => group.items.map((item) => item.key));

export type PermissionSource = "default" | "granted" | "revoked" | "none";

export type PermissionState = {
  roleDefaults: string[];
  overrides: { grants: string[]; revokes: string[] };
};

/** Whether the key is on for this person, given the role defaults and their personal overrides. */
export function isOn(state: PermissionState, key: string): boolean {
  if (state.overrides.revokes.includes(key)) return false;
  return state.roleDefaults.includes(key) || state.overrides.grants.includes(key);
}

/** Where the key's current value comes from: the role default, a personal grant or revoke, or nothing. */
export function sourceOf(state: PermissionState, key: string): PermissionSource {
  const byDefault = state.roleDefaults.includes(key);
  if (byDefault) return state.overrides.revokes.includes(key) ? "revoked" : "default";
  return state.overrides.grants.includes(key) ? "granted" : "none";
}

export function sourceLabel(source: PermissionSource): string {
  if (source === "default") return "역할 기본";
  if (source === "granted") return "개별로 더함";
  if (source === "revoked") return "개별로 뺌";
  return "";
}

/**
 * The PUT body after turning `key` on or off. A key the role already has is never granted, a key
 * it does not have is never revoked, and overrides of keys outside the list stay as stored.
 */
export function toggled(state: PermissionState, key: string, on: boolean): PermissionState["overrides"] {
  const byDefault = state.roleDefaults.includes(key);
  const grants = state.overrides.grants.filter((item) => item !== key);
  const revokes = state.overrides.revokes.filter((item) => item !== key);
  if (on && !byDefault) grants.push(key);
  if (!on && byDefault) revokes.push(key);
  return { grants: grants.sort(), revokes: revokes.sort() };
}

/** Personal changes on the listed keys, for the operator row. */
export function overrideSummary(state: PermissionState): string {
  const added = EDITABLE_KEYS.filter((key) => sourceOf(state, key) === "granted").length;
  const removed = EDITABLE_KEYS.filter((key) => sourceOf(state, key) === "revoked").length;
  if (added === 0 && removed === 0) return "역할 기본 권한";
  const parts = [];
  if (added > 0) parts.push(`${added}개 더함`);
  if (removed > 0) parts.push(`${removed}개 뺌`);
  return `개별 권한 ${parts.join(" · ")}`;
}

/** Same overrides, order ignored. */
export function sameOverrides(left: PermissionState["overrides"], right: PermissionState["overrides"]): boolean {
  const key = (value: PermissionState["overrides"]) =>
    `${[...value.grants].sort().join(",")}|${[...value.revokes].sort().join(",")}`;
  return key(left) === key(right);
}
