import { useState, type ComponentProps } from "react";
import type { FormField } from "../../api/forms";
import type { AnswerInput } from "./AnswerInput";
import { problemFor, prune, visibleFields, type RawAnswer, type RawAnswers } from "./answerModel";
import { ARRIVAL, DEPARTURE, REVERSED_COPY, departureFieldId, rangeProblem } from "./attendanceRange";
import { optionView } from "./optionView";
import { RangeSummary } from "./RangeSummary";

/**
 * Answers being typed on a form: which questions show, each one's problem, and when to show it.
 * Shared by the public form (`PublicApply`) and the participant's own edit (`MeTab`, #427), so both
 * keep the same conditions, checks and the 도착·출발 rule (DEC-074).
 */
export function useAnswerDraft(fields: FormField[], initial: RawAnswers = {}) {
  const [values, setValues] = useState<RawAnswers>(initial);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  // The server also refuses a departure before the arrival (400). It names no field, so a refusal
  // while both are answered is shown on 출발 until either one changes.
  const [rangeRefused, setRangeRefused] = useState(false);
  const departureId = departureFieldId(fields);
  const shown = visibleFields(fields, values);
  const problems = new Map(
    shown.map((field) => {
      const own = problemFor(field, values[field.fieldId]);
      if (own || field.fieldId !== departureId) return [field.fieldId, own];
      return [field.fieldId, rangeProblem(fields, values) ?? (rangeRefused ? REVERSED_COPY : null)];
    }),
  );
  const firstProblem = shown.find((field) => problems.get(field.fieldId));

  function change(fieldId: string, next: RawAnswer) {
    const key = fields.find((field) => field.fieldId === fieldId)?.presetKey;
    if (key === ARRIVAL || key === DEPARTURE) setRangeRefused(false);
    setTouched((current) => new Set(current).add(fieldId));
    setValues((current) => prune(fields, { ...current, [fieldId]: next }));
  }

  /** After a `400 APPLICATION_VALIDATION_FAILED`: the likely cause is the range, if 출발 is shown. */
  function refuseRange() {
    if (departureId && shown.some((field) => field.fieldId === departureId)) {
      setRangeRefused(true);
      setShowAll(true);
    }
  }

  /** Start over from other answers (a newer revision read after a conflict). */
  function reset(next: RawAnswers) {
    setValues(next);
    setTouched(new Set());
    setShowAll(false);
    setRangeRefused(false);
  }

  /** Props for `AnswerInput` of one shown question. */
  function inputProps(field: FormField): ComponentProps<typeof AnswerInput> {
    const problem = problems.get(field.fieldId) ?? null;
    const answered = Object.keys(values[field.fieldId] ?? {}).length > 0;
    // An out-of-order range shows at once on 출발, wherever it was caused (도착 changed later).
    const rangeNow = field.fieldId === departureId && rangeProblem(fields, values) !== null;
    const visibleError = showAll || rangeNow || (touched.has(field.fieldId) && answered) ? problem : null;
    return {
      field,
      ...optionView(field, fields, values),
      value: values[field.fieldId],
      error: visibleError,
      onChange: (next: RawAnswer) => change(field.fieldId, next),
      extra: field.fieldId === departureId ? <RangeSummary fields={fields} values={values} /> : null,
    };
  }

  return { values, shown, firstProblem, showAll, setShowAll, change, refuseRange, reset, inputProps };
}
