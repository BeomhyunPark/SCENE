import { apiRequest } from "./client";
import type { ItemPage } from "./types";

export type FormFieldKind = "SYSTEM" | "CUSTOM";

/** Question types (DEC-068). */
export type AnswerType =
  | "SHORT_TEXT"
  | "LONG_TEXT"
  | "SINGLE_CHOICE"
  | "MULTI_CHOICE"
  | "DROPDOWN"
  | "DATE"
  | "DATE_RANGE"
  | "NUMBER"
  | "YES_NO";

/** `optionIds` for a choice target, `equals` for a yes/no target. */
export type Condition = { fieldId: string; optionIds: string[] } | { fieldId: string; equals: boolean };

/**
 * One condition, or `anyOf` 2–5 of them (true when any is true, no nesting). The server makes
 * `anyOf` only on generated transport options when `partialByTime` is on (#324). The question
 * editor shows it read-only.
 */
export type ShowWhen = Condition | { anyOf: Condition[] };

export function conditionClauses(when: ShowWhen): Condition[] {
  return "anyOf" in when ? when.anyOf : [when];
}

/** True when the condition is absent or holds against the stored answer `answerOf` returns. */
export function conditionHolds(
  when: ShowWhen | null,
  answerOf: (fieldId: string) => Record<string, unknown> | null | undefined,
): boolean {
  if (!when) return true;
  return conditionClauses(when).some((clause) => {
    const answer = answerOf(clause.fieldId);
    if (!answer) return false;
    if ("equals" in clause) return answer.value === clause.equals;
    const ids = [answer.optionId, ...(Array.isArray(answer.optionIds) ? answer.optionIds : [])];
    return ids.some((id) => typeof id === "string" && clause.optionIds.includes(id));
  });
}

export type FieldOption = {
  optionId: string;
  label: string;
  group: string | null;
  hidden: boolean;
  showWhen: ShowWhen | null;
};

/** The server returns every key with defaults filled in. Keys depend on the answer type. */
export type FieldConfig = {
  maxLength?: number;
  format?: "NONE" | "PHONE" | "DIGITS";
  placeholder?: string | null;
  options?: FieldOption[];
  allowOther?: boolean;
  display?: "LIST" | "BUTTONS";
  minSelect?: number;
  maxSelect?: number | null;
  includeTime?: boolean;
  min?: string | number | null;
  max?: string | number | null;
  unit?: string | null;
  style?: "YES_NO" | "CONSENT";
  yesLabel?: string | null;
  noLabel?: string | null;
};

export type FormField = {
  fieldId: string;
  kind: FormFieldKind;
  systemKey: string | null;
  label: string;
  position: number;
  answerType: AnswerType;
  required: boolean;
  description: string | null;
  config: FieldConfig;
  showWhen: ShowWhen | null;
  hidden: boolean;
  /** Fixed key of a question the form setup generated (DEC-070). Null on other questions. */
  presetKey: string | null;
  /** False when the form setup turned the generated question off. Null on other questions. */
  presetActive: boolean | null;
};

/** One event day on the setup card: which meals and worship services it has. */
export type SetupDay = { breakfast: boolean; lunch: boolean; dinner: boolean; worship: boolean };

/**
 * How a partial attendee tells which slots they attend (DEC-074). `RANGE` asks only the arrival and
 * departure slot and counts every slot between; `SLOTS` asks each meal and service (DEC-070).
 */
export type AttendanceMode = "RANGE" | "SLOTS";

/** The operator's answers on the form setup card (DEC-070). The server builds questions from it. */
export type FormSetup = {
  gender: boolean;
  middleGroup: boolean;
  cell: boolean;
  /**
   * Names to choose from, one per entry (DEC-070 Follow-up 2026-11-17). With names the question is a
   * dropdown and the first one also offers 새가족 (등반X); without, it stays a free answer. A setup
   * saved before the lists existed has none.
   */
  middleGroups: string[];
  cells: string[];
  /** `mode` is always in a response. A setup saved before DEC-074 reads as `SLOTS`. */
  /**
   * `noLodging` (DEC-074 Follow-up 2026-11-17) asks commuters to check 수련회장에서 숙박하지 않아요.
   * A setup saved before it reads as false; leaving it out keeps the stored value.
   */
  attendance: { partial: boolean; worshipOnly: boolean; mode: AttendanceMode; noLodging?: boolean };
  /** One entry per event day, in date order. */
  schedule: SetupDay[];
  transport: {
    groupBus: boolean;
    worshipShuttle: boolean;
    car: boolean;
    publicTransit: boolean;
    support: boolean;
    /**
     * Partial attendees see the church vehicles only when they come or leave with them (#324).
     * Has no effect while partial attendance is off. Always in a response; a setup saved before
     * the key reads as false.
     */
    partialByTime: boolean;
  };
  /** The event period the questions were generated for. Set by the server. */
  generatedFor?: { startDate: string; endDate: string };
};

export type FormListItem = {
  formId: string;
  acceptingApplications: boolean;
  /** "신청 수정 받기" (DEC-078 §6), separate from accepting applications. */
  acceptingEdits: boolean;
};

export type FormDetail = FormListItem & {
  fields: FormField[];
  /** True once a submitted application exists (DEC-068 edit lock). */
  locked: boolean;
  /** Null until the first setup is saved. */
  setup: FormSetup | null;
};

/** An option sent to the server. A new option has no `optionId`. */
export type OptionInput = {
  optionId?: string;
  label: string;
  group?: string | null;
  hidden?: boolean;
  showWhen?: ShowWhen | null;
};

export type FieldConfigInput = Omit<FieldConfig, "options"> & { options?: OptionInput[] };

export type FieldInput = {
  label: string;
  answerType?: AnswerType;
  required?: boolean;
  description?: string | null;
  config?: FieldConfigInput;
  showWhen?: ShowWhen | null;
  hidden?: boolean;
};

export function listForms(
  eventId: string,
  query: { page: number; size: number },
): Promise<ItemPage<FormListItem>> {
  return apiRequest(`/api/v1/operator/events/${eventId}/forms`, {
    query: { page: query.page, size: query.size },
  });
}

export function createForm(eventId: string, input: { customLabel?: string } = {}): Promise<FormDetail> {
  const body: { customLabel?: string } = {};
  if (input.customLabel !== undefined) body.customLabel = input.customLabel;
  return apiRequest(`/api/v1/operator/events/${eventId}/forms`, { method: "POST", body });
}

export function getForm(eventId: string, formId: string): Promise<FormDetail> {
  return apiRequest(`/api/v1/operator/events/${eventId}/forms/${formId}`);
}

export function setAccepting(
  eventId: string,
  formId: string,
  acceptingApplications: boolean,
): Promise<FormDetail> {
  return apiRequest(`/api/v1/operator/events/${eventId}/forms/${formId}`, {
    method: "PATCH",
    body: { acceptingApplications },
  });
}

export function addField(eventId: string, formId: string, input: FieldInput): Promise<FormDetail> {
  return apiRequest(`/api/v1/operator/events/${eventId}/forms/${formId}/fields`, {
    method: "POST",
    body: input,
  });
}

/**
 * Sends only the keys that changed. A SYSTEM field takes `label`, `description`, and
 * `config.placeholder`; 또래 also takes `hidden`. A generated question takes wording, `required`,
 * and `hidden` (DEC-070).
 */
export function updateField(
  eventId: string,
  formId: string,
  fieldId: string,
  changes: Partial<FieldInput>,
): Promise<FormDetail> {
  return apiRequest(`/api/v1/operator/events/${eventId}/forms/${formId}/fields/${fieldId}`, {
    method: "PATCH",
    body: changes,
  });
}

export function reorderFields(eventId: string, formId: string, fieldIds: string[]): Promise<FormDetail> {
  return apiRequest(`/api/v1/operator/events/${eventId}/forms/${formId}/fields/order`, {
    method: "PUT",
    body: { fieldIds },
  });
}

export function deleteField(eventId: string, formId: string, fieldId: string): Promise<void> {
  return apiRequest(`/api/v1/operator/events/${eventId}/forms/${formId}/fields/${fieldId}`, {
    method: "DELETE",
  });
}

/** Saves the form setup. The server adds, hides, or removes generated questions to match. */
export function putSetup(eventId: string, formId: string, setup: FormSetup): Promise<FormDetail> {
  // generatedFor is the server's note on the last save and is not sent back.
  const body = {
    gender: setup.gender,
    middleGroup: setup.middleGroup,
    cell: setup.cell,
    middleGroups: setup.middleGroups,
    cells: setup.cells,
    attendance: setup.attendance,
    schedule: setup.schedule,
    transport: setup.transport,
  };
  return apiRequest(`/api/v1/operator/events/${eventId}/forms/${formId}/setup`, {
    method: "PUT",
    body,
  });
}
