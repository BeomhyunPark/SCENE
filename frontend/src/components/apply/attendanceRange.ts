import type { FieldOption, FormField } from "../../api/forms";
import type { RawAnswers } from "./answerModel";

/**
 * The arrival and departure slot questions (DEC-074 `RANGE`). Option ids are slot ids in slot
 * order, so everything here reads the server's options and never makes up a slot.
 */
export const ARRIVAL = "ARRIVAL_SLOT";
export const DEPARTURE = "DEPARTURE_SLOT";

export const REVERSED_COPY = "출발은 도착보다 앞일 수 없어요. 도착한 뒤의 칸을 골라 주세요.";

export function isRangeField(field: FormField): boolean {
  return field.presetKey === ARRIVAL || field.presetKey === DEPARTURE;
}

/** Splits `1월 22일 (금) 저녁부터` into the day and the slot. A label without a space has no day. */
export function splitSlotLabel(label: string): { day: string | null; slot: string } {
  const at = label.lastIndexOf(" ");
  return at > 0 ? { day: label.slice(0, at), slot: label.slice(at + 1) } : { day: null, slot: label };
}

/** Options grouped by day for the chip layout: the day becomes the group, the slot the label. */
export function groupedByDay(options: FieldOption[]): FieldOption[] {
  return options.map((option) => {
    const { day, slot } = splitSlotLabel(option.label);
    return day ? { ...option, group: day, label: slot } : option;
  });
}

type Range = { arrival: FormField; departure: FormField; from: number; to: number };

function chosenRange(fields: FormField[], raw: RawAnswers): Range | null {
  const arrival = fields.find((field) => field.presetKey === ARRIVAL);
  const departure = fields.find((field) => field.presetKey === DEPARTURE);
  if (!arrival || !departure) return null;
  const order = (arrival.config.options ?? []).map((option) => option.optionId);
  const from = order.indexOf(raw[arrival.fieldId]?.optionId ?? "");
  const to = order.indexOf(raw[departure.fieldId]?.optionId ?? "");
  if (from < 0 || to < 0) return null;
  return { arrival, departure, from, to };
}

/** The message for the departure question when it is before the arrival. The same slot is fine. */
export function rangeProblem(fields: FormField[], raw: RawAnswers): string | null {
  const range = chosenRange(fields, raw);
  return range && range.to < range.from ? REVERSED_COPY : null;
}

export function departureFieldId(fields: FormField[]): string | null {
  return fields.find((field) => field.presetKey === DEPARTURE)?.fieldId ?? null;
}

/**
 * The slots the chosen range covers, by day, worded from the arrival options with "부터" taken
 * off: `[{ day: "1월 22일 (금)", slots: ["저녁", "집회"] }]`. Null until both ends are picked
 * in order.
 */
export function rangeSummary(fields: FormField[], raw: RawAnswers): { day: string; slots: string[] }[] | null {
  const range = chosenRange(fields, raw);
  if (!range || range.to < range.from) return null;
  const days: { day: string; slots: string[] }[] = [];
  for (const option of (range.arrival.config.options ?? []).slice(range.from, range.to + 1)) {
    const { day, slot } = splitSlotLabel(option.label.replace(/부터$/, ""));
    const key = day ?? "";
    const last = days.at(-1);
    if (last && last.day === key) last.slots.push(slot);
    else days.push({ day: key, slots: [slot] });
  }
  return days;
}
