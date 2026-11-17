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
export type ShowWhen = { fieldId: string; optionIds: string[] } | { fieldId: string; equals: boolean };

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

/** The operator's answers on the form setup card (DEC-070). The server builds questions from it. */
export type FormSetup = {
  gender: boolean;
  middleGroup: boolean;
  cell: boolean;
  /** 새가족 question (NEWCOMER). Added later: a setup saved before it reads as false. */
  newcomer: boolean;
  attendance: { partial: boolean; worshipOnly: boolean };
  /** One entry per event day, in date order. */
  schedule: SetupDay[];
  transport: {
    groupBus: boolean;
    worshipShuttle: boolean;
    car: boolean;
    publicTransit: boolean;
    support: boolean;
  };
  /** The event period the questions were generated for. Set by the server. */
  generatedFor?: { startDate: string; endDate: string };
};

export type FormListItem = {
  formId: string;
  acceptingApplications: boolean;
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
    newcomer: setup.newcomer,
    attendance: setup.attendance,
    schedule: setup.schedule,
    transport: setup.transport,
  };
  return apiRequest(`/api/v1/operator/events/${eventId}/forms/${formId}/setup`, {
    method: "PUT",
    body,
  });
}
