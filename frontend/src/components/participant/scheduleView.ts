import type { ParticipantScheduleItem } from "../../api/participantSchedule";
import type { ScheduleDay } from "../../api/schedule";

/** "09:30–11:00", "22:00–00:30 (다음 날)", or "09:30" with no end. Local event time as sent, never re-zoned. */
export function timeRange(item: { startTime: string; endTime: string | null; endsNextDay: boolean }): string {
  if (!item.endTime) return item.startTime;
  return `${item.startTime}–${item.endTime}${item.endsNextDay ? " (다음 날)" : ""}`;
}

function dayLabel(days: readonly ScheduleDay[], day: number | string | null | undefined): string {
  if (typeof day !== "number") return "";
  return days.find((entry) => entry.day === day)?.dayLabel ?? `${day}일차`;
}

/** Lines like "시간 09:00 → 09:30", "장소 소강당 → 대강당", "날짜 1월 22일 (금) → 1월 23일 (토)". */
export function previousLines(item: ParticipantScheduleItem, days: readonly ScheduleDay[]): string[] {
  const previous = item.change?.kind === "CHANGED" ? item.change.previous : null;
  if (!previous) return [];
  const lines: string[] = [];
  if ("day" in previous) lines.push(`날짜 ${dayLabel(days, previous.day)} → ${dayLabel(days, item.day)}`);
  if ("startTime" in previous || "endTime" in previous) {
    const before = {
      startTime: typeof previous.startTime === "string" ? previous.startTime : item.startTime,
      endTime: "endTime" in previous ? (typeof previous.endTime === "string" ? previous.endTime : null) : item.endTime,
    };
    const was = timeRange({ ...before, endsNextDay: before.endTime !== null && before.endTime < before.startTime });
    lines.push(`시간 ${was} → ${timeRange(item)}`);
  }
  if ("place" in previous) {
    const was = typeof previous.place === "string" && previous.place ? previous.place : "없음";
    lines.push(`장소 ${was} → ${item.place ?? "없음"}`);
  }
  return lines;
}
