import type { FieldOption, FormField } from "../../api/forms";
import { optionsHiddenByCondition, visibleFields, visibleOptions, type RawAnswers } from "./answerModel";
import { ARRIVAL, DEPARTURE } from "./attendanceRange";

/**
 * What one choice question offers on screen, and a short line on why some choices are gone.
 * Only the arrival and departure lists are narrowed further than the conditions; that is a
 * screen aid and never changes what is sent.
 */
export type OptionView = { options: FieldOption[]; notice: string | null };

export function optionView(field: FormField, fields: FormField[], raw: RawAnswers): OptionView {
  const options = visibleOptions(field, fields, raw);
  if (field.presetKey === ARRIVAL || field.presetKey === DEPARTURE) return narrowRange(field, fields, raw, options);
  if (field.presetKey === "TRANSPORT_IN" || field.presetKey === "TRANSPORT_OUT") {
    return { options, notice: vehicleNotice(field, fields, raw) };
  }
  return { options, notice: null };
}

/**
 * Departure hides the slots before the chosen arrival, and arrival hides the slots after the
 * chosen departure, so the two lists stay short on a phone. A slot already picked stays listed so
 * the out-of-order message has something to point at.
 */
function narrowRange(field: FormField, fields: FormField[], raw: RawAnswers, options: FieldOption[]): OptionView {
  const isDeparture = field.presetKey === DEPARTURE;
  const other = fields.find((item) => item.presetKey === (isDeparture ? ARRIVAL : DEPARTURE));
  const order = (field.config.options ?? []).map((option) => option.optionId);
  const at = order.indexOf((other && raw[other.fieldId]?.optionId) ?? "");
  if (at < 0) return { options, notice: null };
  const own = raw[field.fieldId]?.optionId;
  const kept = options.filter((option) => {
    if (option.optionId === own) return true;
    const index = order.indexOf(option.optionId);
    return isDeparture ? index >= at : index <= at;
  });
  const gone = options.length - kept.length;
  if (gone === 0) return { options, notice: null };
  return {
    options: kept,
    notice: isDeparture ? "도착보다 앞선 칸은 빼고 보여 드려요." : "출발보다 뒤의 칸은 빼고 보여 드려요.",
  };
}

/**
 * The church vehicles a partial attendee cannot take at their arrival or departure (#324). Only
 * `anyOf` conditions come from that setting; other conditions follow the attendance answer and
 * need no word.
 */
function vehicleNotice(field: FormField, fields: FormField[], raw: RawAnswers): string | null {
  const back = field.presetKey === "TRANSPORT_OUT";
  // Word it only for someone who answered by time: a full or worship-only attendee never had the
  // vehicle on offer, as before the setting.
  const timed = new Set(
    visibleFields(fields, raw)
      .filter((item) => item.presetKey === ARRIVAL || item.presetKey === DEPARTURE || item.presetKey === "MEALS")
      .map((item) => item.fieldId),
  );
  const lines = optionsHiddenByCondition(field, fields, raw)
    .filter(
      (option) =>
        option.showWhen &&
        "anyOf" in option.showWhen &&
        option.showWhen.anyOf.some((clause) => timed.has(clause.fieldId)),
    )
    .map((option) => {
      if (option.optionId === "opt_group") {
        return back ? `마지막 일정까지 있는 분만 ${option.label}을 탈 수 있어요.` : `첫 일정부터 오는 분만 ${option.label}을 탈 수 있어요.`;
      }
      if (option.optionId === "opt_shuttle") {
        return back ? `집회 시간에 떠나는 분만 ${option.label}을 탈 수 있어요.` : `집회 시간에 오는 분만 ${option.label}을 탈 수 있어요.`;
      }
      return null;
    })
    .filter((line): line is string => line !== null);
  return lines.length > 0 ? lines.join(" ") : null;
}

