import { apiRequest } from "./client";
import { ApiError } from "./errors";

/**
 * 식수 현황 (#454, DEC-087): per meal slot the planned count (신청 기준) and the count that reflects
 * arrivals. Contract: backend/docs/api.md "식수 현황". Numbers only; no names, phones or ids.
 * `reflected` = `arrived` + `coming`; `planned` = `arrived` + `coming` + `missing`.
 */
export type MealCountKind = "BREAKFAST" | "LUNCH" | "DINNER";
export type MealCountSlot = {
  slotId: string;
  meal: MealCountKind;
  label: string;
  startTime: string;
  timeFromSchedule: boolean;
  passed: boolean;
  planned: number;
  arrived: number;
  coming: number;
  missing: number;
  reflected: number;
};
export type MealCountDay = { day: number; date: string; label: string; slots: MealCountSlot[] };
export type MealCounts = {
  eventStatus: string | null;
  asOf: string;
  nextSlotId: string | null;
  submitted: number;
  checkedIn: number;
  unknown: { count: number; arrived: number };
  days: MealCountDay[];
};

export function getMealCounts(eventId: string, signal?: AbortSignal): Promise<MealCounts> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/meal-counts`, { signal }).then(parseMealCounts);
}

class Shape extends Error {}

function fail(): never {
  throw new Shape();
}

export function parseMealCounts(value: unknown): MealCounts {
  try {
    const v = record(value);
    const unknown = record(v.unknown);
    return {
      eventStatus: v.eventStatus === null || v.eventStatus === undefined ? null : str(v.eventStatus),
      asOf: str(v.asOf),
      nextSlotId: v.nextSlotId === null || v.nextSlotId === undefined ? null : str(v.nextSlotId),
      submitted: num(v.submitted),
      checkedIn: num(v.checkedIn),
      unknown: { count: num(unknown.count), arrived: num(unknown.arrived) },
      days: list(v.days, (raw) => {
        const d = record(raw);
        return {
          day: num(d.day),
          date: str(d.date),
          label: str(d.label),
          slots: list(d.slots, (item) => {
            const s = record(item);
            const meal = str(s.meal);
            if (!["BREAKFAST", "LUNCH", "DINNER"].includes(meal)) fail();
            return {
              slotId: str(s.slotId),
              meal: meal as MealCountKind,
              label: str(s.label),
              startTime: str(s.startTime),
              timeFromSchedule: bool(s.timeFromSchedule),
              passed: bool(s.passed),
              planned: num(s.planned),
              arrived: num(s.arrived),
              coming: num(s.coming),
              missing: num(s.missing),
              reflected: num(s.reflected),
            };
          }),
        };
      }),
    };
  } catch (caught) {
    if (caught instanceof Shape) throw new ApiError({ status: 200, code: "UNEXPECTED" });
    throw caught;
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : fail();
}

function list<T>(value: unknown, read: (item: unknown) => T): T[] {
  return Array.isArray(value) ? value.map(read) : fail();
}

function str(value: unknown): string {
  return typeof value === "string" ? value : fail();
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fail();
}

function bool(value: unknown): boolean {
  return typeof value === "boolean" ? value : fail();
}
