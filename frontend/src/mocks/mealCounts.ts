import type { MealCounts, MealCountSlot } from "../api/mealCounts";
import { attendedSlotIds, formSlots, type MockSlot } from "./attendedSlots";
import { checkedInAtOf } from "./checkInStore";
import { eventFormDetail } from "./formStore";
import { eventById } from "./operatorStore";
import { tableApplications } from "./participantStore";
import { scheduleSlotStartTimes } from "./scheduleStore";

/**
 * Mock of MealCountService/MealTally (DEC-087): the same counting rule over the mock stores.
 * `setMealCountsNow` pins the clock for tests and demos; the backend tests are the source of truth.
 */
const DEFAULT_TIMES: Record<MockSlot["meal"], string> = { BREAKFAST: "08:00", LUNCH: "12:00", DINNER: "18:00", WORSHIP: "19:30" };
const GRACE_MS = 60 * 60 * 1000;
const SEOUL_OFFSET = "+09:00";

let pinnedNow: Date | null = null;

export function setMealCountsNow(now: Date | null): void {
  pinnedNow = now;
}

/** Start of the run of attended slots holding `slotId` (the server's ArrivalSlots.dueSlot). */
export function dueSlot(slots: readonly MockSlot[], attended: readonly string[], slotId: string): string | null {
  if (!attended.includes(slotId)) return null;
  const chosen = new Set(attended);
  let start: string | null = null;
  for (const slot of slots) {
    if (chosen.has(slot.slotId)) {
      start ??= slot.slotId;
      if (slot.slotId === slotId) return start;
    } else if (slot.meal !== "WORSHIP") {
      start = null;
    }
  }
  return null;
}

export function mealCounts(eventId: string): MealCounts {
  const now = pinnedNow ?? new Date();
  const rows = tableApplications(eventId);
  const arrived = (participantId: string) => checkedInAtOf(eventId, participantId) !== null;
  const base = {
    eventStatus: eventById(eventId)?.lifecycleStatus ?? null,
    asOf: new Date(Math.floor(now.getTime() / 1000) * 1000).toISOString().replace(".000Z", "Z"),
    submitted: rows.length,
    checkedIn: rows.filter((row) => arrived(row.participantId)).length,
  };
  const form = eventFormDetail(eventId);
  const slots = form ? formSlots(form) : null;
  if (!form || !slots) return { ...base, nextSlotId: null, unknown: { count: 0, arrived: 0 }, days: [] };

  const scheduled = scheduleSlotStartTimes(eventId);
  const index = new Map(slots.map((slot, at) => [slot.slotId, at]));
  const passed = new Map<string, boolean>();
  let cursor = Number.POSITIVE_INFINITY;
  slots.forEach((slot, at) => {
    const time = scheduled.get(slot.slotId) ?? DEFAULT_TIMES[slot.meal];
    const gone = now.getTime() >= Date.parse(`${slot.date}T${time}:00${SEOUL_OFFSET}`) + GRACE_MS;
    passed.set(slot.slotId, gone);
    if (!gone && cursor === Number.POSITIVE_INFINITY) cursor = at;
  });

  const counts = new Map<string, [number, number, number]>();
  let unknown = 0;
  let unknownArrived = 0;
  for (const row of rows) {
    const ids = attendedSlotIds(form, slots, new Map(Object.entries(row.answers)));
    const here = arrived(row.participantId);
    if (!ids) {
      unknown += 1;
      if (here) unknownArrived += 1;
      continue;
    }
    for (const id of ids) {
      const count = counts.get(id) ?? [0, 0, 0];
      const due = dueSlot(slots, ids, id);
      if (here) count[0] += 1;
      else if (due !== null && (index.get(due) ?? -1) >= cursor) count[1] += 1;
      else count[2] += 1;
      counts.set(id, count);
    }
  }

  let nextSlotId: string | null = null;
  const days: MealCounts["days"] = [];
  slots.forEach((slot, at) => {
    if (slot.meal === "WORSHIP") return;
    if (nextSlotId === null && at >= cursor) nextSlotId = slot.slotId;
    const [a, c, m] = counts.get(slot.slotId) ?? [0, 0, 0];
    const item: MealCountSlot = {
      slotId: slot.slotId,
      meal: slot.meal,
      label: slot.label,
      startTime: scheduled.get(slot.slotId) ?? DEFAULT_TIMES[slot.meal],
      timeFromSchedule: scheduled.has(slot.slotId),
      passed: passed.get(slot.slotId) ?? false,
      planned: a + c + m,
      arrived: a,
      coming: c,
      missing: m,
      reflected: a + c,
    };
    let day = days.find((entry) => entry.day === slot.day);
    if (!day) days.push((day = { day: slot.day, date: slot.date, label: slot.dayLabel, slots: [] }));
    day.slots.push(item);
  });
  return { ...base, nextSlotId, unknown: { count: unknown, arrived: unknownArrived }, days };
}
