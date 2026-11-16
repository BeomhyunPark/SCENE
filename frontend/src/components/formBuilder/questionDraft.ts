import type { AnswerType, FieldConfigInput, FieldInput, FormField, ShowWhen } from "../../api/forms";

/** Korean names for the nine question types (DEC-068). */
export const TYPE_LABELS: Record<AnswerType, string> = {
  SHORT_TEXT: "단답형",
  LONG_TEXT: "서술형",
  SINGLE_CHOICE: "단수선택",
  MULTI_CHOICE: "복수선택",
  DROPDOWN: "드롭다운",
  DATE: "날짜",
  DATE_RANGE: "기간",
  NUMBER: "숫자",
  YES_NO: "예/아니오",
};

export const TYPE_ORDER: AnswerType[] = [
  "SHORT_TEXT",
  "LONG_TEXT",
  "SINGLE_CHOICE",
  "MULTI_CHOICE",
  "DROPDOWN",
  "DATE",
  "DATE_RANGE",
  "NUMBER",
  "YES_NO",
];

export function hasOptions(type: AnswerType): boolean {
  return type === "SINGLE_CHOICE" || type === "MULTI_CHOICE" || type === "DROPDOWN";
}

/** Questions a condition may point at. */
export function isConditionTarget(field: FormField): boolean {
  return field.kind === "CUSTOM" && (hasOptions(field.answerType) || field.answerType === "YES_NO");
}

export type OptionDraft = {
  /** Local key for React. Stable across edits. */
  key: string;
  /** Set once the server has stored the option. */
  optionId?: string;
  label: string;
  group: string;
  hidden: boolean;
  showWhen: ShowWhen | null;
};

/** Text inputs stay strings so the operator can type freely; `toInput` converts them. */
export type QuestionDraft = {
  label: string;
  description: string;
  answerType: AnswerType;
  required: boolean;
  hidden: boolean;
  showWhen: ShowWhen | null;
  maxLength: string;
  format: "NONE" | "PHONE" | "DIGITS";
  placeholder: string;
  options: OptionDraft[];
  allowOther: boolean;
  display: "LIST" | "BUTTONS";
  minSelect: string;
  maxSelect: string;
  includeTime: boolean;
  min: string;
  max: string;
  unit: string;
  style: "YES_NO" | "CONSENT";
  yesLabel: string;
  noLabel: string;
};

let keySeed = 0;

export function newOption(label = ""): OptionDraft {
  keySeed += 1;
  return { key: `new-${keySeed}`, label, group: "", hidden: false, showWhen: null };
}

/** Date questions start inside the event period when the event has one. */
export function emptyDraft(period: { startDate: string | null; endDate: string | null }): QuestionDraft {
  return {
    label: "",
    description: "",
    answerType: "SHORT_TEXT",
    required: false,
    hidden: false,
    showWhen: null,
    maxLength: "",
    format: "NONE",
    placeholder: "",
    options: [newOption(), newOption()],
    allowOther: false,
    display: "LIST",
    minSelect: "",
    maxSelect: "",
    includeTime: false,
    min: period.startDate ?? "",
    max: period.endDate ?? "",
    unit: "",
    style: "YES_NO",
    yesLabel: "",
    noLabel: "",
  };
}

export function draftFromField(field: FormField): QuestionDraft {
  const config = field.config;
  const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));
  return {
    label: field.label,
    description: field.description ?? "",
    answerType: field.answerType,
    required: field.required,
    hidden: field.hidden,
    showWhen: field.showWhen,
    maxLength: text(config.maxLength),
    format: config.format ?? "NONE",
    placeholder: text(config.placeholder),
    options: (config.options ?? []).map((option) => ({
      key: option.optionId,
      optionId: option.optionId,
      label: option.label,
      group: option.group ?? "",
      hidden: option.hidden,
      showWhen: option.showWhen,
    })),
    allowOther: config.allowOther ?? false,
    display: config.display ?? "LIST",
    minSelect: config.minSelect ? String(config.minSelect) : "",
    maxSelect: text(config.maxSelect),
    includeTime: config.includeTime ?? false,
    min: text(config.min),
    max: text(config.max),
    unit: text(config.unit),
    style: config.style ?? "YES_NO",
    yesLabel: text(config.yesLabel),
    noLabel: text(config.noLabel),
  };
}

/** Switching "시간 포함" keeps the bounds valid for the new format. */
export function withIncludeTime(draft: QuestionDraft, includeTime: boolean): QuestionDraft {
  const convert = (value: string, end: boolean) => {
    if (!value) return value;
    if (includeTime) return value.includes("T") ? value : `${value}T${end ? "23:59" : "00:00"}`;
    return value.slice(0, 10);
  };
  return { ...draft, includeTime, min: convert(draft.min, false), max: convert(draft.max, true) };
}

/** Client-side checks before the server sees it. Returns a message, or null when fine. */
export function draftProblem(draft: QuestionDraft): string | null {
  const label = draft.label.trim();
  if (label.length < 1 || label.length > 200) return "질문을 1–200자로 써 주세요.";
  if (draft.description.trim().length > 500) return "설명은 500자까지 쓸 수 있어요.";
  if (hasOptions(draft.answerType)) {
    const filled = draft.options.filter((option) => option.label.trim());
    if (filled.length === 0) return "보기를 하나 이상 써 주세요.";
    if (filled.length > 50) return "보기는 50개까지 만들 수 있어요.";
    if (filled.some((option) => option.label.trim().length > 100)) return "보기는 100자까지 쓸 수 있어요.";
  }
  if (draft.answerType === "MULTI_CHOICE") {
    const min = optionalInt(draft.minSelect);
    const max = optionalInt(draft.maxSelect);
    if (min === undefined || max === undefined) return "선택 개수는 숫자로 써 주세요.";
    if (min !== null && max !== null && min > max) return "최소 선택 수가 최대보다 클 수 없어요.";
  }
  if (draft.answerType === "NUMBER") {
    const min = optionalInt(draft.min);
    const max = optionalInt(draft.max);
    if (min === undefined || max === undefined) return "범위는 정수로 써 주세요.";
    if (min !== null && max !== null && min > max) return "최솟값이 최댓값보다 클 수 없어요.";
  }
  if ((draft.answerType === "DATE" || draft.answerType === "DATE_RANGE") && draft.min && draft.max) {
    if (draft.min > draft.max) return "시작 날짜가 끝 날짜보다 늦을 수 없어요.";
  }
  if (draft.showWhen && "optionIds" in draft.showWhen && draft.showWhen.optionIds.length === 0) {
    return "표시 조건의 보기를 하나 이상 골라 주세요.";
  }
  return null;
}

/** The body for add, or for a full edit. Blank option rows are dropped. */
export function toInput(draft: QuestionDraft): FieldInput {
  return {
    label: draft.label.trim(),
    answerType: draft.answerType,
    required: draft.required,
    description: draft.description.trim() || null,
    config: toConfig(draft),
    showWhen: draft.showWhen,
    hidden: draft.hidden,
  };
}

function toConfig(draft: QuestionDraft): FieldConfigInput {
  const blank = (value: string) => value.trim() || null;
  switch (draft.answerType) {
    case "SHORT_TEXT":
      return {
        ...(optionalInt(draft.maxLength) ? { maxLength: optionalInt(draft.maxLength)! } : {}),
        format: draft.format,
        placeholder: blank(draft.placeholder),
      };
    case "LONG_TEXT":
      return {
        ...(optionalInt(draft.maxLength) ? { maxLength: optionalInt(draft.maxLength)! } : {}),
        placeholder: blank(draft.placeholder),
      };
    case "SINGLE_CHOICE":
      return { options: options(draft), allowOther: draft.allowOther, display: draft.display };
    case "MULTI_CHOICE":
      return {
        options: options(draft),
        allowOther: draft.allowOther,
        minSelect: optionalInt(draft.minSelect) ?? 0,
        maxSelect: optionalInt(draft.maxSelect) ?? null,
      };
    case "DROPDOWN":
      return { options: options(draft) };
    case "DATE":
    case "DATE_RANGE":
      return { includeTime: draft.includeTime, min: blank(draft.min), max: blank(draft.max) };
    case "NUMBER":
      return { min: optionalInt(draft.min) ?? null, max: optionalInt(draft.max) ?? null, unit: blank(draft.unit) };
    case "YES_NO":
      return { style: draft.style, yesLabel: blank(draft.yesLabel), noLabel: blank(draft.noLabel) };
  }
}

function options(draft: QuestionDraft) {
  return draft.options
    .filter((option) => option.label.trim())
    .map((option) => ({
      ...(option.optionId ? { optionId: option.optionId } : {}),
      label: option.label.trim(),
      group: option.group.trim() || null,
      hidden: option.hidden,
      showWhen: option.showWhen,
    }));
}

/** `null` for blank, `undefined` for not an integer. */
function optionalInt(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^-?\d+$/.test(trimmed)) return undefined;
  return Number(trimmed);
}

/** One line for the list: type, then the condition in words. */
export function conditionSummary(condition: ShowWhen | null, fields: FormField[]): string | null {
  if (!condition) return null;
  const target = fields.find((field) => field.fieldId === condition.fieldId);
  if (!target) return "조건 대상 질문이 없어요";
  if ("equals" in condition) return `'${target.label}'에 ${condition.equals ? "예" : "아니오"}일 때`;
  const labels = condition.optionIds
    .map((id) => target.config.options?.find((option) => option.optionId === id)?.label)
    .filter(Boolean);
  return `'${target.label}'이(가) ${labels.join(", ")}일 때`;
}
