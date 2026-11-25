import type { MealCounts, MealCountSlot } from "../api/mealCounts";

/**
 * 주방에 보낼 식수 글 (#454, DEC-089 §9). The reflected count comes first; the planned count and the
 * people left out follow, so the kitchen can judge a margin.
 */
export type MealLine = { dayLabel: string; slot: MealCountSlot };

/** Meal slots in order with their day label. */
export function mealLines(data: MealCounts): MealLine[] {
  return data.days.flatMap((day) => day.slots.map((slot) => ({ dayLabel: day.label, slot })));
}

/** The next meal and every meal after it. Empty when every meal has passed. */
export function remainingLines(data: MealCounts): MealLine[] {
  const lines = mealLines(data);
  const at = lines.findIndex((line) => line.slot.slotId === data.nextSlotId);
  return at < 0 ? [] : lines.slice(at);
}

export function mealLine({ dayLabel, slot }: MealLine): string {
  const left = slot.missing > 0 ? ` (신청 ${count(slot.planned)}명, 아직 안 온 ${count(slot.missing)}명 제외)` : "";
  return `${dayLabel} ${slot.label} ${count(slot.reflected)}명${left}`;
}

/** The text to copy: a heading with the time it was read, the lines, and a note for unknown meals. */
export function kitchenText(eventName: string, data: MealCounts, lines: MealLine[]): string {
  const out = [`[${eventName}] 식수 (${asOfLabel(data.asOf)} 기준)`, ...lines.map(mealLine)];
  if (data.unknown.count > 0) out.push(`끼니를 모르는 신청 ${count(data.unknown.count)}명은 빠져 있어요.`);
  return out.join("\n");
}

/** `1/22 14:05` in the event zone. */
export function asOfLabel(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("month")}/${part("day")} ${part("hour")}:${part("minute")}`;
}

function count(value: number): string {
  return value.toLocaleString("ko-KR");
}
