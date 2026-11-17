import type {
  ApplicationSummary,
  CarpoolOffer,
  MobilityRequest,
  SummaryChoice,
  SummaryDay,
  SummaryNight,
} from "../api/applicationSummary";
import type { FormField } from "../api/forms";
import { attendanceMode, attendedSlotIds, formSlots, rangeEnds, slotDay } from "./attendedSlots";
import { dayLabel, eventDays } from "./formPreset";
import { eventFormDetail } from "./formStore";
import { eventById } from "./operatorStore";
import { submittedAnswers } from "./participantStore";

/**
 * Mock of the server's ApplicationSummaryService (#251, DEC-073), with the same rules: answers by
 * preset key and option id, a hidden question reads as not asked (its area is null and its stored
 * answers do not count), full attendees eat every meal and sleep every night, a driver there drives
 * back. The backend integration tests are the source of truth.
 */
const ATTENDANCE: Record<string, "full" | "partial" | "worshipOnly"> = {
  opt_full: "full",
  opt_partial: "partial",
  opt_worship: "worshipOnly",
};
const ORDINALS = ["첫째", "둘째", "셋째", "넷째", "다섯째", "여섯째", "일곱째", "여덟째", "아홉째"];

type Value = Record<string, unknown>;
type Person = { applicationId: string; answers: Map<string, Value> };

export function applicationSummary(eventId: string): ApplicationSummary {
  const eventStatus = eventById(eventId)?.lifecycleStatus ?? null;
  const form = eventFormDetail(eventId);
  if (!form) {
    return {
      eventStatus,
      formId: null,
      fromSetup: false,
      total: 0,
      attendance: { asked: false, full: 0, partial: 0, worshipOnly: 0 },
      gender: null,
      cohorts: null,
      meals: null,
      lodging: null,
      transport: null,
      shuttle: null,
      carpool: null,
      mobility: null,
    };
  }
  const byKey = new Map<string, FormField>();
  let nameField: FormField | undefined;
  let cohortField: FormField | undefined;
  for (const field of form.fields) {
    if (field.presetKey) byKey.set(field.presetKey, field);
    else if (field.systemKey === "NAME") nameField = field;
    else if (field.systemKey === "COHORT") cohortField = field;
  }
  const visible = (field: FormField | undefined) => (field && !field.hidden ? field : undefined);
  const shown = (key: string) => visible(byKey.get(key));
  const answer = (person: Person, field: FormField | undefined): Value | undefined =>
    field ? person.answers.get(field.fieldId) : undefined;
  const people: Person[] = submittedAnswers(eventId);

  const attendanceField = shown("ATTENDANCE");
  const groups = { full: [] as Person[], partial: [] as Person[], worshipOnly: [] as Person[] };
  for (const person of people) {
    const id = optionId(answer(person, attendanceField));
    groups[(id && ATTENDANCE[id]) || "full"].push(person);
  }

  const name = visible(nameField);
  const cohort = visible(cohortField);
  const who = (person: Person) => ({
    name: text(answer(person, name)),
    cohort: text(answer(person, cohort)),
  });
  const setup = form.setup;
  const start = setup?.generatedFor?.startDate;
  const end = setup?.generatedFor?.endDate;

  return {
    eventStatus,
    formId: form.formId,
    fromSetup: setup !== null,
    total: people.length,
    attendance: {
      asked: attendanceField !== undefined,
      full: groups.full.length,
      partial: groups.partial.length,
      worshipOnly: groups.worshipOnly.length,
    },
    gender: single(shown("GENDER")),
    cohorts: cohorts(),
    meals: setup && start ? meals() : null,
    lodging: setup && start && end ? lodging(start, end) : null,
    transport: transport(),
    shuttle: shuttle(),
    carpool: carpool(),
    mobility: mobility(),
  };

  function counts(field: FormField, tally: Map<string, number>): SummaryChoice["options"] {
    return (field.config.options ?? []).map((option) => ({
      optionId: option.optionId,
      label: option.label,
      hidden: option.hidden === true,
      count: tally.get(option.optionId) ?? 0,
    }));
  }

  function single(field: FormField | undefined): SummaryChoice | null {
    if (!field) return null;
    const tally = new Map<string, number>();
    let none = 0;
    for (const person of people) {
      const id = optionId(answer(person, field));
      if (!id || !hasOption(field, id)) none++;
      else bump(tally, id);
    }
    return { options: counts(field, tally), noAnswer: none };
  }

  function cohorts(): ApplicationSummary["cohorts"] {
    if (!cohort) return null;
    const tally = new Map<string, number>();
    let none = 0;
    for (const person of people) {
      const value = text(answer(person, cohort));
      if (value === null) none++;
      else bump(tally, value);
    }
    const items = [...tally.entries()]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, count]) => ({ cohort: key, count }));
    return { items, noAnswer: none };
  }

  function meals(): ApplicationSummary["meals"] {
    // Same slots and the same per-person rule as the table and the board (attendedSlots).
    const slots = formSlots(form!);
    if (!slots) return null;
    const tally = new Map<string, number>();
    let unanswered = 0;
    for (const person of people) {
      const ids = attendedSlotIds(form!, slots, person.answers);
      if (!ids) unanswered++;
      else ids.forEach((id) => bump(tally, id));
    }
    const days: SummaryDay[] = [];
    for (const slot of slots) {
      const entry = { optionId: slot.slotId, meal: slot.meal, label: slot.label, count: tally.get(slot.slotId) ?? 0 };
      const last = days.at(-1);
      if (last && last.day === slot.day) last.slots.push(entry);
      else days.push({ day: slot.day, date: slot.date, label: slot.dayLabel, slots: [entry] });
    }
    return { days, unanswered };
  }

  function lodging(from: string, to: string): ApplicationSummary["lodging"] {
    const count = eventDays(from, to) - 1;
    if (count < 1) return null;
    const field = shown("LODGING");
    const labels = byKey.get("LODGING");
    const chosen = new Map<string, number>();
    const range = attendanceMode(form!) === "RANGE";
    let rangeUnknown = 0;
    for (const person of groups.partial) {
      if (!range) {
        optionIds(answer(person, field))?.forEach((id) => bump(chosen, id));
        continue;
      }
      // DEC-074 §5: arriving on day ≤ N and leaving on day ≥ N+1 sleeps the Nth night.
      const ends = rangeEnds(form!, person.answers);
      const from = ends ? slotDay(ends.from) : null;
      const to = ends ? slotDay(ends.to) : null;
      if (from === null || to === null) {
        rangeUnknown++;
        continue;
      }
      for (let night = from; night < to; night++) bump(chosen, `opt_n${night}`);
    }
    const nights: SummaryNight[] = Array.from({ length: count }, (_, index) => {
      const id = `opt_n${index + 1}`;
      return {
        optionId: id,
        night: index + 1,
        date: dateAt(from, index),
        label: optionLabel(labels, id) ?? `${ORDINALS[index]} 밤 (${dayLabel(from, index)})`,
        count: groups.full.length + (chosen.get(id) ?? 0),
      };
    });
    return { nights, unanswered: range ? rangeUnknown : field ? 0 : groups.partial.length };
  }

  function transport(): ApplicationSummary["transport"] {
    const way = shown("TRANSPORT_IN");
    if (!way) return null;
    const back = shown("TRANSPORT_OUT");
    const there = new Map<string, number>();
    const home = new Map<string, number>();
    let thereNone = 0;
    let homeNone = 0;
    for (const person of people) {
      const id = optionId(answer(person, way));
      if (!id || !hasOption(way, id)) {
        thereNone++;
        homeNone++;
        continue;
      }
      bump(there, id);
      if (id === "opt_car" || id === "opt_ride") {
        // Drivers and riders come back the way they went (DEC-070 §3, #324).
        bump(home, id);
        continue;
      }
      const backId = optionId(answer(person, back));
      if (!backId || !back || !hasOption(back, backId)) homeNone++;
      else bump(home, backId);
    }
    const rows: SummaryChoice["options"] = [];
    const listed = new Set<string>();
    for (const option of way.config.options ?? []) {
      listed.add(option.optionId);
      const source = option.optionId === "opt_car" || option.optionId === "opt_ride" || !back ? undefined : findOption(back, option.optionId);
      const label = source ?? option;
      rows.push({
        optionId: option.optionId,
        label: label.label,
        hidden: label.hidden === true,
        count: home.get(option.optionId) ?? 0,
      });
    }
    for (const option of back?.config.options ?? []) {
      if (listed.has(option.optionId)) continue;
      listed.add(option.optionId);
      rows.push({
        optionId: option.optionId,
        label: option.label,
        hidden: option.hidden === true,
        count: home.get(option.optionId) ?? 0,
      });
    }
    return {
      in: { options: counts(way, there), noAnswer: thereNone },
      out: { options: rows, noAnswer: homeNone },
    };
  }

  function rounds(field: FormField | undefined, way: FormField | undefined): SummaryChoice | null {
    if (!field) return null;
    const tally = new Map<string, number>();
    let none = 0;
    for (const person of people) {
      const ids = optionIds(answer(person, field));
      if (!ids) {
        if (optionId(answer(person, way)) === "opt_shuttle") none++;
        continue;
      }
      ids.forEach((id) => bump(tally, id));
    }
    return { options: counts(field, tally), noAnswer: none };
  }

  function shuttle(): ApplicationSummary["shuttle"] {
    const there = rounds(shown("SHUTTLE_IN"), shown("TRANSPORT_IN"));
    const back = rounds(shown("SHUTTLE_OUT"), shown("TRANSPORT_OUT"));
    return there === null && back === null ? null : { in: there, out: back };
  }

  function carpool(): ApplicationSummary["carpool"] {
    const offer = shown("CARPOOL_OFFER");
    if (!offer) return null;
    const seats = shown("CARPOOL_SEATS");
    const area = shown("CARPOOL_AREA");
    const note = shown("CARPOOL_NOTE");
    const offers: CarpoolOffer[] = [];
    let seatTotal = 0;
    for (const person of people) {
      if (answer(person, offer)?.value !== true) continue;
      const number = answer(person, seats)?.number;
      const count = typeof number === "number" && Number.isInteger(number) ? number : null;
      if (count !== null) seatTotal += count;
      offers.push({
        applicationId: person.applicationId,
        ...who(person),
        seats: count,
        area: text(answer(person, area)),
        note: text(answer(person, note)),
      });
    }
    offers.sort(byName);
    return { offerCount: offers.length, seatTotal, offers };
  }

  function requests(field: FormField | undefined): MobilityRequest[] | null {
    if (!field) return null;
    const out: MobilityRequest[] = [];
    for (const person of people) {
      const value = text(answer(person, field));
      if (value !== null) out.push({ applicationId: person.applicationId, ...who(person), area: value });
    }
    return out.sort(byName);
  }

  function mobility(): ApplicationSummary["mobility"] {
    const there = requests(shown("MOBILITY_IN"));
    const back = requests(shown("MOBILITY_OUT"));
    return there === null && back === null ? null : { in: there, out: back };
  }
}

function byName(left: { name: string | null; applicationId: string }, right: { name: string | null; applicationId: string }) {
  if (left.name !== right.name) {
    if (left.name === null) return 1;
    if (right.name === null) return -1;
    return left.name < right.name ? -1 : 1;
  }
  return left.applicationId < right.applicationId ? -1 : left.applicationId > right.applicationId ? 1 : 0;
}

function bump(tally: Map<string, number>, key: string) {
  tally.set(key, (tally.get(key) ?? 0) + 1);
}

function findOption(field: FormField, id: string) {
  return field.config.options?.find((option) => option.optionId === id);
}

function hasOption(field: FormField, id: string): boolean {
  return findOption(field, id) !== undefined;
}

function optionLabel(field: FormField | undefined, id: string): string | null {
  return (field && findOption(field, id)?.label) ?? null;
}

function optionId(value: Value | undefined): string | null {
  return typeof value?.optionId === "string" ? value.optionId : null;
}

function optionIds(value: Value | undefined): Set<string> | null {
  if (!value || !Array.isArray(value.optionIds)) return null;
  return new Set(value.optionIds.filter((id): id is string => typeof id === "string"));
}

function text(value: Value | undefined): string | null {
  if (typeof value?.text !== "string") return null;
  const trimmed = value.text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function dateAt(start: string, offset: number): string {
  return new Date(Date.parse(`${start}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
}
