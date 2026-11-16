import type { AnswerItem } from "../../api/applications";
import type { FieldOption, FormField, ShowWhen } from "../../api/forms";

/**
 * What the participant has typed or picked for one question. Inputs stay strings until
 * submit. The shape is loose on purpose: each answer type reads only its own keys.
 */
export type RawAnswer = {
  text?: string;
  optionId?: string;
  optionIds?: string[];
  /** "기타" is picked (single choice: instead of an option). */
  otherOn?: boolean;
  other?: string;
  date?: string;
  start?: string;
  end?: string;
  number?: string;
  bool?: boolean;
};

export type RawAnswers = Record<string, RawAnswer>;


/** The value the server will store, or null for "no answer". Mirrors `AnswerEvaluator`. */
type Stored = Record<string, unknown> | null;

/**
 * Walks the fields in position order like the server: a question shows when it is not
 * hidden and its condition holds against the answers kept so far.
 */
export function visibleFields(fields: FormField[], raw: RawAnswers): FormField[] {
  const kept = new Map<string, Stored>();
  const visible: FormField[] = [];
  for (const field of fields) {
    if (field.hidden || !holds(field.showWhen, kept)) continue;
    visible.push(field);
    const stored = storedValue(field, raw[field.fieldId]);
    if (stored) kept.set(field.fieldId, stored);
  }
  return visible;
}

/** Options the participant may pick, given the answers to earlier questions. */
export function visibleOptions(field: FormField, fields: FormField[], raw: RawAnswers): FieldOption[] {
  const kept = keptBefore(field, fields, raw);
  return (field.config.options ?? []).filter((option) => !option.hidden && holds(option.showWhen, kept));
}

/** Drops answers to questions and options that are no longer shown. */
export function prune(fields: FormField[], raw: RawAnswers): RawAnswers {
  const shown = visibleFields(fields, raw);
  const next: RawAnswers = {};
  for (const field of shown) {
    const answer = raw[field.fieldId];
    if (!answer) continue;
    const allowed = new Set(visibleOptions(field, fields, raw).map((option) => option.optionId));
    next[field.fieldId] = {
      ...answer,
      optionId: answer.optionId && allowed.has(answer.optionId) ? answer.optionId : undefined,
      optionIds: answer.optionIds?.filter((id) => allowed.has(id)),
    };
  }
  return next;
}

/** A message for the participant, or null when this answer is fine. */
export function problemFor(field: FormField, answer: RawAnswer | undefined): string | null {
  const config = field.config;
  const stored = storedValue(field, answer);
  if (stored === undefined) return invalidCopy(field);
  if (stored === null) return field.required ? requiredCopy(field) : null;
  switch (field.answerType) {
    case "SHORT_TEXT":
    case "LONG_TEXT": {
      const text = String(stored.text);
      const max = config.maxLength ?? 200;
      if (text.length > max) return `${max}자까지 적을 수 있어요.`;
      const digits = text.replace(/\D/g, "");
      if (config.format === "PHONE" && digits.length < 4) return "전화번호는 숫자 4개 이상이 필요해요.";
      if (config.format === "DIGITS" && digits.length !== text.length) return "숫자만 적어 주세요.";
      return null;
    }
    case "SINGLE_CHOICE":
    case "DROPDOWN":
      return typeof stored.other === "string" && stored.other.length > 200 ? "200자까지 적을 수 있어요." : null;
    case "MULTI_CHOICE": {
      const count = (stored.optionIds as string[]).length + (stored.other ? 1 : 0);
      const min = config.minSelect ?? 0;
      const max = config.maxSelect ?? null;
      if (count < min) return `${min}개 이상 골라 주세요.`;
      if (max !== null && count > max) return `${max}개까지 고를 수 있어요.`;
      return null;
    }
    case "DATE":
      return outOfRange(String(stored.date ?? stored.dateTime), config) ? rangeCopy(field) : null;
    case "DATE_RANGE": {
      const start = String(stored.start);
      const end = String(stored.end);
      if (start > end) return "끝이 시작보다 빠를 수 없어요.";
      return outOfRange(start, config) || outOfRange(end, config) ? rangeCopy(field) : null;
    }
    case "NUMBER": {
      const value = Number(stored.number);
      const min = config.min == null ? null : Number(config.min);
      const max = config.max == null ? null : Number(config.max);
      if ((min !== null && value < min) || (max !== null && value > max)) {
        if (min !== null && max !== null) return `${min}–${max} 사이로 적어 주세요.`;
        return min !== null ? `${min} 이상으로 적어 주세요.` : `${max} 이하로 적어 주세요.`;
      }
      return null;
    }
    case "YES_NO":
      return field.required && config.style === "CONSENT" && stored.value !== true ? "동의해야 신청할 수 있어요." : null;
  }
}

/** Request items for the shown questions. Text questions use the `text` shortcut. */
export function toAnswerItems(fields: FormField[], raw: RawAnswers): AnswerItem[] {
  const items: AnswerItem[] = [];
  for (const field of visibleFields(fields, raw)) {
    const stored = storedValue(field, raw[field.fieldId]);
    if (!stored) continue;
    if (field.answerType === "SHORT_TEXT" || field.answerType === "LONG_TEXT") {
      items.push({ fieldId: field.fieldId, text: String(stored.text) });
    } else {
      items.push({ fieldId: field.fieldId, value: stored });
    }
  }
  return items;
}

/** `undefined` means "typed but not a valid value" (e.g. "1.5" for a whole number). */
function storedValue(field: FormField, answer: RawAnswer | undefined): Stored | undefined {
  if (!answer) return null;
  const config = field.config;
  switch (field.answerType) {
    case "SHORT_TEXT":
    case "LONG_TEXT": {
      const text = (answer.text ?? "").trim();
      return text ? { text } : null;
    }
    case "SINGLE_CHOICE":
    case "DROPDOWN": {
      if (answer.otherOn) {
        const other = (answer.other ?? "").trim();
        return other ? { other } : null;
      }
      return answer.optionId ? { optionId: answer.optionId } : null;
    }
    case "MULTI_CHOICE": {
      const optionIds = answer.optionIds ?? [];
      const other = answer.otherOn ? (answer.other ?? "").trim() : "";
      if (optionIds.length === 0 && !other) return null;
      return other ? { optionIds, other } : { optionIds };
    }
    case "DATE": {
      if (!answer.date) return null;
      return config.includeTime ? { dateTime: answer.date } : { date: answer.date };
    }
    case "DATE_RANGE": {
      if (!answer.start && !answer.end) return null;
      if (!answer.start || !answer.end) return undefined;
      return { start: answer.start, end: answer.end };
    }
    case "NUMBER": {
      const text = (answer.number ?? "").trim();
      if (!text) return null;
      if (!/^-?\d+$/.test(text)) return undefined;
      return { number: Number(text) };
    }
    case "YES_NO":
      return answer.bool === undefined ? null : { value: answer.bool };
  }
}

function keptBefore(field: FormField, fields: FormField[], raw: RawAnswers): Map<string, Stored> {
  const kept = new Map<string, Stored>();
  for (const item of fields) {
    if (item.fieldId === field.fieldId) break;
    if (item.hidden || !holds(item.showWhen, kept)) continue;
    const stored = storedValue(item, raw[item.fieldId]);
    if (stored) kept.set(item.fieldId, stored);
  }
  return kept;
}

function holds(condition: ShowWhen | null, kept: Map<string, Stored>): boolean {
  if (!condition) return true;
  const answer = kept.get(condition.fieldId);
  if (!answer) return false;
  if ("equals" in condition) return answer.value === condition.equals;
  if (typeof answer.optionId === "string") return condition.optionIds.includes(answer.optionId);
  if (Array.isArray(answer.optionIds)) return answer.optionIds.some((id) => condition.optionIds.includes(String(id)));
  return false;
}

function outOfRange(value: string, config: FormField["config"]): boolean {
  return (config.min != null && value < String(config.min)) || (config.max != null && value > String(config.max));
}

function rangeCopy(field: FormField): string {
  const min = field.config.min ? display(String(field.config.min)) : null;
  const max = field.config.max ? display(String(field.config.max)) : null;
  if (min && max) return `${min}부터 ${max}까지 고를 수 있어요.`;
  return min ? `${min} 이후로 골라 주세요.` : `${max} 이전으로 골라 주세요.`;
}

function display(value: string): string {
  return value.replace("T", " ");
}

function requiredCopy(field: FormField): string {
  if (field.answerType === "YES_NO" && field.config.style === "CONSENT") return "동의해야 신청할 수 있어요.";
  if (field.answerType === "SHORT_TEXT" || field.answerType === "LONG_TEXT" || field.answerType === "NUMBER") {
    return "꼭 적어 주세요.";
  }
  return "꼭 골라 주세요.";
}

function invalidCopy(field: FormField): string {
  if (field.answerType === "NUMBER") return "정수로 적어 주세요.";
  if (field.answerType === "DATE_RANGE") return "시작과 끝을 모두 골라 주세요.";
  return "입력 내용을 확인해 주세요.";
}
