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
};

export type FormListItem = {
  formId: string;
  acceptingApplications: boolean;
};

export type FormDetail = FormListItem & {
  fields: FormField[];
  /** True once a submitted application exists (DEC-068 edit lock). */
  locked: boolean;
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

/** Sends only the keys that changed. A SYSTEM field takes `label` only. */
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
