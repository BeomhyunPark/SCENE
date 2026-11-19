export function formatSceneDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return "";
  return `${year}. ${Number(month)}. ${Number(day)}`;
}

export function formatKoreanDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return "";
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

export function eventContext(event: {
  startDate?: string | null;
  endDate?: string | null;
  place?: string | null;
}): string {
  const dates = [event.startDate, event.endDate]
    .filter((iso): iso is string => Boolean(iso))
    .map(formatKoreanDate);
  const when = [...new Set(dates)].join(" – ");
  return [when, event.place ?? ""].filter((part) => part.length > 0).join(" · ");
}

export function lifecycleLabel(status: string): string {
  if (status === "DRAFT") return "준비 중";
  if (status === "ACTIVE") return "진행 중";
  if (status === "ENDED") return "종료";
  if (status === "ARCHIVED") return "보관";
  return status;
}

const submittedFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Submit time in Korea time, like "2026. 10. 8. 12:00". Empty when the value is not a time. */
export function formatSubmittedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(submittedFormat.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}. ${Number(parts.month)}. ${Number(parts.day)}. ${parts.hour}:${parts.minute}`;
}

/** Fallback when the list item has no NAME answer. */
export function applicantName(name: string | null): string {
  return name && name.trim().length > 0 ? name : "이름 없음";
}

/** Operator role as shown on invitation and member screens. */
export function operatorRoleLabel(role: string): string {
  if (role === "OWNER") return "Owner";
  if (role === "MANAGER") return "Manager";
  if (role === "STAFF") return "Staff";
  return role;
}

/** Space (organization) role on the settings member list and space invitations (DEC-076). */
export function spaceRoleLabel(role: string): string {
  if (role === "OWNER") return "Owner";
  if (role === "ADMIN") return "Admin";
  if (role === "MEMBER") return "Member";
  return role;
}

const publishedFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Publish time in Korea time, like "12월 20일 18:00" (Figma 667:75536, participant 내 조). Empty when the value is not a time. */
export function formatPublishedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(publishedFormat.formatToParts(date).map((part) => [part.type, part.value]));
  return `${Number(parts.month)}월 ${Number(parts.day)}일 ${parts.hour}:${parts.minute}`;
}
