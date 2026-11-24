import type { GroupAttendance, GroupSlot, LeaderView, LeaderViewMember } from "../../api/participantGroup";

/**
 * 조원 현황 (F3, DEC-083): what the leader screen counts on the phone from `leaderView` alone. The
 * server sends slots and each member's attended slot ids; arrival, departure and per-slot counts are
 * computed here so the server keeps one shape (DEC-083 Consequence). Pure functions so tests can pin
 * the date.
 *
 * - Arrival is `arrivalSlotId` when the server sent it (RANGE partial), otherwise the first attended
 *   slot in slot order; departure likewise with `departureSlotId` or the last one.
 * - A member whose slots are unknown (`slotIds: null`) is in no count and is reported as "모름".
 * - "오늘" is the Korea date of the (server-corrected) clock.
 */
export type MemberSpan = { arrival: GroupSlot; departure: GroupSlot };

const koreaDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "YYYY-MM-DD" in Korea time. */
export function koreaDate(at: number): string {
  return koreaDateFormat.format(new Date(at));
}

export function memberSpan(attendance: GroupAttendance, slots: readonly GroupSlot[] | null): MemberSpan | null {
  if (!slots || slots.length === 0 || !attendance.slotIds) return null;
  const chosen = new Set(attendance.slotIds);
  const attended = slots.filter((slot) => chosen.has(slot.slotId));
  const byId = (id: string | null) => (id ? slots.find((slot) => slot.slotId === id) ?? null : null);
  const arrival = byId(attendance.arrivalSlotId) ?? attended[0] ?? null;
  const departure = byId(attendance.departureSlotId) ?? attended.at(-1) ?? null;
  return arrival && departure ? { arrival, departure } : null;
}

export type Movement = { member: LeaderViewMember; slot: GroupSlot };

export type TodayMovements =
  | { inEvent: false }
  | { inEvent: true; dayLabel: string; coming: Movement[]; going: Movement[]; unknown: LeaderViewMember[] };

/** Who arrives and leaves on `today`. Outside the event's slot days there is nothing to list. */
export function todayMovements(view: LeaderView, today: string): TodayMovements {
  const slots = view.slots ?? [];
  const todays = slots.filter((slot) => slot.date === today);
  if (todays.length === 0) return { inEvent: false };
  const coming: Movement[] = [];
  const going: Movement[] = [];
  const unknown: LeaderViewMember[] = [];
  for (const member of view.members) {
    const span = memberSpan(member.attendance, slots);
    if (!span) {
      unknown.push(member);
      continue;
    }
    if (span.arrival.date === today) coming.push({ member, slot: span.arrival });
    if (span.departure.date === today) going.push({ member, slot: span.departure });
  }
  const order = (a: Movement, b: Movement) => a.slot.sortOrder - b.slot.sortOrder;
  return { inEvent: true, dayLabel: todays[0].dayLabel, coming: coming.sort(order), going: going.sort(order), unknown };
}

export type SlotDay = { day: number; dayLabel: string; slots: { slot: GroupSlot; count: number }[] };

/** Members per slot, grouped by day in slot order, and how many members have unknown slots. */
export function slotCounts(view: LeaderView): { days: SlotDay[]; unknown: number } {
  const slots = view.slots ?? [];
  const known = view.members.filter((member) => member.attendance.slotIds !== null);
  const days: SlotDay[] = [];
  for (const slot of slots) {
    const count = known.filter((member) => member.attendance.slotIds!.includes(slot.slotId)).length;
    let day = days.find((item) => item.day === slot.day);
    if (!day) days.push((day = { day: slot.day, dayLabel: slot.dayLabel, slots: [] }));
    day.slots.push({ slot, count });
  }
  return { days, unknown: view.members.length - known.length };
}

export function attendanceText(type: GroupAttendance["type"]): string {
  if (type === "PARTIAL") return "부분 참석";
  if (type === "WORSHIP_ONLY") return "집회만";
  return "전체 참석";
}

/** "1월 23일 (토) 저녁 ~ 1월 24일 (일) 점심", or null when unknown. */
export function spanText(attendance: GroupAttendance, slots: readonly GroupSlot[] | null): string | null {
  const span = memberSpan(attendance, slots);
  if (!span) return null;
  const at = (slot: GroupSlot) => `${slot.dayLabel} ${slot.label}`;
  return span.arrival.slotId === span.departure.slotId ? at(span.arrival) : `${at(span.arrival)} ~ ${at(span.departure)}`;
}

export function lodgingText(nights: number[] | null): string {
  if (nights === null) return "모름";
  if (nights.length === 0) return "숙박 안 함";
  return `${nights.map((night) => `${night}일째`).join("·")} 밤`;
}
