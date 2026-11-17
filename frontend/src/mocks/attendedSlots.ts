import type { MealKind } from "../api/applicationSummary";
import type { FormDetail, FormField } from "../api/forms";
import { dayLabel } from "./formPreset";

/**
 * Mock of the server's `MealSlots`/`AttendedSlots` (DEC-074 §7): the one place the mocks decide
 * which slots a person attends. The summary (meals, lodging) and the 참가 현황 table use it, so
 * they agree like the server's 집계·편성판·표·CSV. The backend tests are the source of truth.
 */
export type MockSlot = {
  slotId: string;
  day: number;
  date: string;
  dayLabel: string;
  meal: MealKind;
  label: string;
  sortOrder: number;
};

type Value = Record<string, unknown>;

const KINDS: [key: "breakfast" | "lunch" | "dinner" | "worship", meal: MealKind, label: string][] = [
  ["breakfast", "BREAKFAST", "아침"],
  ["lunch", "LUNCH", "점심"],
  ["dinner", "DINNER", "저녁"],
  ["worship", "WORSHIP", "집회"],
];

function dateAt(start: string, offset: number): string {
  return new Date(Date.parse(`${start}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
}

function preset(form: FormDetail, key: string): FormField | undefined {
  return form.fields.find((field) => field.presetKey === key);
}

/** A hidden question reads as not asked: its stored answers do not count. */
function shown(form: FormDetail, key: string): FormField | undefined {
  const field = preset(form, key);
  return field && !field.hidden ? field : undefined;
}

export function attendanceMode(form: FormDetail): "RANGE" | "SLOTS" {
  return form.setup?.attendance.mode ?? "SLOTS";
}

/** Slots in order (day, then 아침 → 점심 → 저녁 → 집회). Null without a setup or without any slot. */
export function formSlots(form: FormDetail): MockSlot[] | null {
  const setup = form.setup;
  const start = setup?.generatedFor?.startDate;
  if (!setup || !start) return null;
  const meals = preset(form, "MEALS");
  const slots: MockSlot[] = [];
  setup.schedule.forEach((entry, index) => {
    for (const [key, meal, fallback] of KINDS) {
      if (!entry[key]) continue;
      const slotId = `opt_d${index + 1}_${key}`;
      const label = meals?.config.options?.find((option) => option.optionId === slotId)?.label ?? fallback;
      slots.push({ slotId, day: index + 1, date: dateAt(start, index), dayLabel: dayLabel(start, index), meal, label, sortOrder: slots.length });
    }
  });
  return slots.length > 0 ? slots : null;
}

function optionId(value: Value | undefined): string | null {
  return typeof value?.optionId === "string" ? value.optionId : null;
}

type Kind = "full" | "partial" | "worshipOnly";

/** No attendance question, or no answer to it, counts as full attendance (like the summary). */
export function attendanceKind(form: FormDetail, answers: ReadonlyMap<string, Value>): Kind {
  const field = shown(form, "ATTENDANCE");
  const id = field ? optionId(answers.get(field.fieldId)) : null;
  return id === "opt_partial" ? "partial" : id === "opt_worship" ? "worshipOnly" : "full";
}

/** The arrival and departure slot ids of a `RANGE` partial attendee, or null when either is missing. */
export function rangeEnds(form: FormDetail, answers: ReadonlyMap<string, Value>): { from: string; to: string } | null {
  const arrival = shown(form, "ARRIVAL_SLOT");
  const departure = shown(form, "DEPARTURE_SLOT");
  const from = arrival ? optionId(answers.get(arrival.fieldId)) : null;
  const to = departure ? optionId(answers.get(departure.fieldId)) : null;
  return from && to ? { from, to } : null;
}

/** Day number of a slot id (`opt_d2_lunch` → 2). */
export function slotDay(slotId: string): number | null {
  const match = /^opt_d(\d+)_/.exec(slotId);
  return match ? Number(match[1]) : null;
}

/**
 * Slot ids a person attends, in slot order; null is "모름". Full: every slot. `RANGE` partial:
 * arrival through departure, both included. Otherwise the `MEALS` answer.
 */
export function attendedSlotIds(
  form: FormDetail,
  slots: readonly MockSlot[],
  answers: ReadonlyMap<string, Value>,
): string[] | null {
  const kind = attendanceKind(form, answers);
  if (kind === "full") return slots.map((slot) => slot.slotId);
  if (kind === "partial" && attendanceMode(form) === "RANGE") {
    const ends = rangeEnds(form, answers);
    if (!ends) return null;
    const from = slots.findIndex((slot) => slot.slotId === ends.from);
    const to = slots.findIndex((slot) => slot.slotId === ends.to);
    if (from < 0 || to < 0) return null;
    return slots.slice(from, to + 1).map((slot) => slot.slotId);
  }
  const meals = shown(form, "MEALS");
  const value = meals ? answers.get(meals.fieldId) : undefined;
  if (!value || !Array.isArray(value.optionIds)) return null;
  const chosen = new Set(value.optionIds);
  return slots.filter((slot) => chosen.has(slot.slotId)).map((slot) => slot.slotId);
}

/** True when a `RANGE` answer leaves before it arrives (the server's 400). Same slot is fine. */
export function reversedRange(form: FormDetail, answers: ReadonlyMap<string, Value>): boolean {
  if (attendanceMode(form) !== "RANGE" || attendanceKind(form, answers) !== "partial") return false;
  const ends = rangeEnds(form, answers);
  const options = preset(form, "ARRIVAL_SLOT")?.config.options ?? [];
  if (!ends) return false;
  const from = options.findIndex((option) => option.optionId === ends.from);
  const to = options.findIndex((option) => option.optionId === ends.to);
  return from >= 0 && to >= 0 && to < from;
}
