import { apiRequest } from "./client";
import { ApiError } from "./errors";

/**
 * Operator summary of an event's SUBMITTED applications (#251, DEC-073). One request draws the whole
 * summary screen. Contract: backend/docs/api.md "신청 집계". A `null` area means the form did not ask
 * that question (turned off, or no setup), not zero. Phones and access keys are never in it.
 */
export type SummaryOption = { optionId: string; label: string; hidden: boolean; count: number };
export type SummaryChoice = { options: SummaryOption[]; noAnswer: number };
export type MealKind = "BREAKFAST" | "LUNCH" | "DINNER" | "WORSHIP";
export type SummarySlot = { optionId: string; meal: MealKind; label: string; count: number };
export type SummaryDay = { day: number; date: string; label: string; slots: SummarySlot[] };
export type SummaryNight = { optionId: string; night: number; date: string; label: string; count: number };
export type CarpoolOffer = {
  applicationId: string;
  name: string | null;
  cohort: string | null;
  seats: number | null;
  area: string | null;
  note: string | null;
};
export type MobilityRequest = { applicationId: string; name: string | null; cohort: string | null; area: string };

export type ApplicationSummary = {
  eventStatus: string | null;
  formId: string | null;
  fromSetup: boolean;
  total: number;
  attendance: { asked: boolean; full: number; partial: number; worshipOnly: number };
  gender: SummaryChoice | null;
  cohorts: { items: { cohort: string; count: number }[]; noAnswer: number } | null;
  meals: { days: SummaryDay[]; unanswered: number } | null;
  lodging: { nights: SummaryNight[]; unanswered: number } | null;
  transport: { in: SummaryChoice; out: SummaryChoice } | null;
  shuttle: { in: SummaryChoice | null; out: SummaryChoice | null } | null;
  carpool: { offerCount: number; seatTotal: number; offers: CarpoolOffer[] } | null;
  mobility: { in: MobilityRequest[] | null; out: MobilityRequest[] | null } | null;
};

export function getApplicationSummary(eventId: string, signal?: AbortSignal): Promise<ApplicationSummary> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/applications/summary`, { signal }).then(parseSummary);
}

class Shape extends Error {}

function fail(): never {
  throw new Shape();
}

export function parseSummary(value: unknown): ApplicationSummary {
  try {
    const v = record(value);
    const attendance = record(v.attendance);
    return {
      eventStatus: nullable(v.eventStatus, str),
      formId: nullable(v.formId, str),
      fromSetup: bool(v.fromSetup),
      total: num(v.total),
      attendance: {
        asked: bool(attendance.asked),
        full: num(attendance.full),
        partial: num(attendance.partial),
        worshipOnly: num(attendance.worshipOnly),
      },
      gender: nullable(v.gender, choice),
      cohorts: nullable(v.cohorts, (raw) => {
        const c = record(raw);
        return {
          items: list(c.items, (item) => {
            const i = record(item);
            return { cohort: str(i.cohort), count: num(i.count) };
          }),
          noAnswer: num(c.noAnswer),
        };
      }),
      meals: nullable(v.meals, (raw) => {
        const m = record(raw);
        return {
          days: list(m.days, (day) => {
            const d = record(day);
            return {
              day: num(d.day),
              date: str(d.date),
              label: str(d.label),
              slots: list(d.slots, (slot) => {
                const s = record(slot);
                const meal = str(s.meal);
                if (!["BREAKFAST", "LUNCH", "DINNER", "WORSHIP"].includes(meal)) fail();
                return { optionId: str(s.optionId), meal: meal as MealKind, label: str(s.label), count: num(s.count) };
              }),
            };
          }),
          unanswered: num(m.unanswered),
        };
      }),
      lodging: nullable(v.lodging, (raw) => {
        const l = record(raw);
        return {
          nights: list(l.nights, (night) => {
            const n = record(night);
            return {
              optionId: str(n.optionId),
              night: num(n.night),
              date: str(n.date),
              label: str(n.label),
              count: num(n.count),
            };
          }),
          unanswered: num(l.unanswered),
        };
      }),
      transport: nullable(v.transport, (raw) => {
        const t = record(raw);
        return { in: choice(t.in), out: choice(t.out) };
      }),
      shuttle: nullable(v.shuttle, (raw) => {
        const s = record(raw);
        return { in: nullable(s.in, choice), out: nullable(s.out, choice) };
      }),
      carpool: nullable(v.carpool, (raw) => {
        const c = record(raw);
        return {
          offerCount: num(c.offerCount),
          seatTotal: num(c.seatTotal),
          offers: list(c.offers, (offer) => {
            const o = record(offer);
            return {
              applicationId: str(o.applicationId),
              name: nullable(o.name, str),
              cohort: nullable(o.cohort, str),
              seats: nullable(o.seats, num),
              area: nullable(o.area, str),
              note: nullable(o.note, str),
            };
          }),
        };
      }),
      mobility: nullable(v.mobility, (raw) => {
        const m = record(raw);
        return { in: nullable(m.in, requests), out: nullable(m.out, requests) };
      }),
    };
  } catch (caught) {
    if (caught instanceof Shape) throw new ApiError({ status: 200, code: "UNEXPECTED" });
    throw caught;
  }
}

function choice(raw: unknown): SummaryChoice {
  const c = record(raw);
  return {
    options: list(c.options, (option) => {
      const o = record(option);
      return { optionId: str(o.optionId), label: str(o.label), hidden: o.hidden === true, count: num(o.count) };
    }),
    noAnswer: num(c.noAnswer),
  };
}

function requests(raw: unknown): MobilityRequest[] {
  return list(raw, (item) => {
    const r = record(item);
    return {
      applicationId: str(r.applicationId),
      name: nullable(r.name, str),
      cohort: nullable(r.cohort, str),
      area: str(r.area),
    };
  });
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : fail();
}

function list<T>(value: unknown, read: (item: unknown) => T): T[] {
  return Array.isArray(value) ? value.map(read) : fail();
}

function nullable<T>(value: unknown, read: (raw: unknown) => T): T | null {
  return value === null || value === undefined ? null : read(value);
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
