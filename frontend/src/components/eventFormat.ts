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
