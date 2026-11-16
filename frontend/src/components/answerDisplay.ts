import type { ApplicationAnswer } from "../api/applications";
import type { FieldOption } from "../api/forms";

export const HIDDEN_MARK = " (숨김)";
export const NO_ANSWER = "답변 없음";

/** Question title in the original view. A hidden question keeps its column with a mark (DEC-068 §6). */
export function answerLabel(answer: ApplicationAnswer): string {
  return answer.hidden ? `${answer.label}${HIDDEN_MARK}` : answer.label;
}

/**
 * One stored answer as text an operator reads. Option ids become the current option text, and an
 * option that is hidden now keeps its text with a mark. An option in a group shows the group first.
 * Dates stay in event-local time as stored.
 */
export function formatAnswer(answer: ApplicationAnswer): string {
  const value = answer.value;
  switch (answer.answerType) {
    case "SINGLE_CHOICE":
    case "DROPDOWN":
      if (typeof value.optionId === "string") return optionText(answer, value.optionId);
      if (typeof value.other === "string") return otherText(value.other);
      return fallback(answer);
    case "MULTI_CHOICE": {
      const parts = Array.isArray(value.optionIds)
        ? value.optionIds.filter((id): id is string => typeof id === "string").map((id) => optionText(answer, id))
        : [];
      if (typeof value.other === "string") parts.push(otherText(value.other));
      return parts.length > 0 ? parts.join(", ") : fallback(answer);
    }
    case "DATE":
      if (typeof value.date === "string") return formatLocal(value.date);
      if (typeof value.dateTime === "string") return formatLocal(value.dateTime);
      return fallback(answer);
    case "DATE_RANGE":
      if (typeof value.start === "string" && typeof value.end === "string") {
        return `${formatLocal(value.start)} ~ ${formatLocal(value.end)}`;
      }
      return fallback(answer);
    case "NUMBER":
      if (typeof value.number === "number") {
        const unit = answer.config.unit;
        return unit ? `${value.number} ${unit}` : String(value.number);
      }
      return fallback(answer);
    case "YES_NO":
      if (typeof value.value === "boolean") return yesNoText(answer, value.value);
      return fallback(answer);
    default:
      return fallback(answer);
  }
}

function optionText(answer: ApplicationAnswer, optionId: string): string {
  const option: FieldOption | undefined = answer.config.options?.find((item) => item.optionId === optionId);
  if (!option) return "알 수 없는 보기";
  // A grouped option (a meal on a day) is ambiguous without its group: "집회" on which day?
  const text = option.group ? `${option.group} ${option.label}` : option.label;
  return option.hidden ? `${text}${HIDDEN_MARK}` : text;
}

function otherText(text: string): string {
  return `기타: ${text}`;
}

function yesNoText(answer: ApplicationAnswer, yes: boolean): string {
  const consent = answer.config.style === "CONSENT";
  if (yes) return answer.config.yesLabel || (consent ? "동의함" : "예");
  return answer.config.noLabel || (consent ? "동의 안 함" : "아니오");
}

/** Text answers, and any stored shape the type does not expect. */
function fallback(answer: ApplicationAnswer): string {
  const text = answer.value.text;
  return typeof text === "string" && text.length > 0 ? text : NO_ANSWER;
}

/** `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm` (no offset) as `2027. 1. 22.` or `2027. 1. 22. 14:30`. */
function formatLocal(text: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(text);
  if (!match) return text;
  const [, year, month, day, hour, minute] = match;
  const date = `${year}. ${Number(month)}. ${Number(day)}.`;
  return hour ? `${date} ${hour}:${minute}` : date;
}
