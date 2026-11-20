import type { NoticeAudienceType, NoticeStatus } from "../../api/notices";

export const AUDIENCE_LABEL: Record<NoticeAudienceType, string> = {
  ALL: "전체",
  LEADERS: "조장",
  STAFF: "운영진",
};

/** One line on who reads the notice, shown under the audience choice. */
export const AUDIENCE_HINT: Record<NoticeAudienceType, string> = {
  ALL: "신청한 참가자 모두가 봐요.",
  LEADERS: "공개한 조 편성의 조장만 봐요. 다른 참가자에게는 보이지 않아요.",
  STAFF: "이 행사의 운영 멤버만 행사 홈에서 봐요. 참가자에게는 보이지 않아요.",
};

export const STATUS_LABEL: Record<NoticeStatus, string> = {
  DRAFT: "초안",
  PUBLISHED: "발행",
  ARCHIVED: "보관",
};

const stampFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const clockFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "11월 20일 12:30" in Korea time. */
export function noticeStamp(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(stampFormat.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.month}월 ${parts.day}일 ${parts.hour}:${parts.minute}`;
}

/** "HH:mm" in Korea time, for "수정됨 HH:mm". */
export function noticeClock(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(clockFormat.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.hour}:${parts.minute}`;
}

export function notifiedCopy(count: number): string {
  return count > 0 ? `${count.toLocaleString("ko-KR")}명에게 알렸어요.` : "알림을 받을 사람이 아직 없어요.";
}

export const PIN_LIMIT_COPY = "고정은 3개까지예요. 다른 고정을 풀어 주세요.";

export function noticesHref(eventId: string, ...rest: string[]): string {
  return [`/events/${eventId}/notices`, ...rest].join("/");
}
