import { apiRequest } from "./client";
import { ApiError } from "./errors";
import type { AnswerType, FieldConfig, FormField } from "./forms";
import type { ItemPage } from "./types";

export type PublicForm = {
  formId: string;
  fields: FormField[];
};

/** Request items for `POST …/applications`. Text questions may use the `text` shortcut. */
export type AnswerItem = { fieldId: string; text: string } | { fieldId: string; value: Record<string, unknown> };

export type SubmittedApplication = {
  applicationId: string;
  participantId: string;
  accessKey: string;
};

/** Operator list item. Name is the SYSTEM NAME answer, or null. Phone stays on the detail only. */
export type ApplicationListItem = {
  applicationId: string;
  formId: string;
  status: string;
  submittedAt: string;
  name: string | null;
};

/**
 * One stored answer with its question's current type, hidden flag and config (DEC-068 §6), so the
 * original view can show option text and mark hidden questions and options. `value` keeps the
 * stored shape (DEC-068 §1), for example `{ text }`, `{ optionIds, other }` or `{ start, end }`.
 */
export type ApplicationAnswer = {
  fieldId: string;
  kind: "SYSTEM" | "CUSTOM";
  systemKey: string | null;
  label: string;
  position: number;
  answerType: AnswerType;
  hidden: boolean;
  config: FieldConfig;
  value: Record<string, unknown>;
};

export type ApplicationDetail = {
  applicationId: string;
  formId: string;
  status: string;
  submittedAt: string;
  answers: ApplicationAnswer[];
};

export function listApplications(
  eventId: string,
  query: { page: number; size: number },
  signal?: AbortSignal,
): Promise<ItemPage<ApplicationListItem>> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/applications`, {
    query: { page: query.page, size: query.size },
    signal,
  }).then(parseListPage);
}

export function getApplication(
  eventId: string,
  applicationId: string,
  signal?: AbortSignal,
): Promise<ApplicationDetail> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/applications/${applicationId}`, {
    signal,
  }).then(parseDetail);
}

export function getPublicForm(eventId: string, formId: string, signal?: AbortSignal): Promise<PublicForm> {
  return apiRequest<unknown>(`/api/v1/public/events/${eventId}/forms/${formId}`, { signal }).then(parseForm);
}

export function submitApplication(
  eventId: string,
  formId: string,
  answers: AnswerItem[],
): Promise<SubmittedApplication> {
  return apiRequest<unknown>(`/api/v1/public/events/${eventId}/forms/${formId}/applications`, {
    method: "POST",
    body: { answers },
  }).then(parseSubmitted);
}

function parseForm(value: unknown): PublicForm {
  if (!isRecord(value) || typeof value.formId !== "string" || !Array.isArray(value.fields)) {
    throw new ApiError({ status: 200, code: "UNEXPECTED" });
  }
  const fields: FormField[] = [];
  for (const field of value.fields) {
    if (!isField(field)) throw new ApiError({ status: 200, code: "UNEXPECTED" });
    fields.push(withDefaults(field));
  }
  return { formId: value.formId, fields };
}

function parseSubmitted(value: unknown): SubmittedApplication {
  if (
    !isRecord(value) ||
    typeof value.applicationId !== "string" ||
    typeof value.participantId !== "string" ||
    typeof value.accessKey !== "string" ||
    value.accessKey.length === 0
  ) {
    throw new ApiError({ status: 201, code: "UNEXPECTED" });
  }
  return {
    applicationId: value.applicationId,
    participantId: value.participantId,
    accessKey: value.accessKey,
  };
}

function parseListPage(value: unknown): ItemPage<ApplicationListItem> {
  if (!isRecord(value) || !Array.isArray(value.items) || !isPage(value.page)) {
    throw new ApiError({ status: 200, code: "UNEXPECTED" });
  }
  const items: ApplicationListItem[] = [];
  for (const item of value.items) {
    if (
      !isRecord(item) ||
      typeof item.applicationId !== "string" ||
      typeof item.formId !== "string" ||
      typeof item.status !== "string" ||
      typeof item.submittedAt !== "string" ||
      !(item.name === null || typeof item.name === "string")
    ) {
      throw new ApiError({ status: 200, code: "UNEXPECTED" });
    }
    items.push({
      applicationId: item.applicationId,
      formId: item.formId,
      status: item.status,
      submittedAt: item.submittedAt,
      name: item.name,
    });
  }
  const { number, size, totalItems, totalPages } = value.page;
  return { items, page: { number, size, totalItems, totalPages } };
}

function parseDetail(value: unknown): ApplicationDetail {
  if (
    !isRecord(value) ||
    typeof value.applicationId !== "string" ||
    typeof value.formId !== "string" ||
    typeof value.status !== "string" ||
    typeof value.submittedAt !== "string" ||
    !Array.isArray(value.answers)
  ) {
    throw new ApiError({ status: 200, code: "UNEXPECTED" });
  }
  const answers: ApplicationAnswer[] = [];
  for (const answer of value.answers) {
    if (!isField(answer) || !isRecord(answer.value)) throw new ApiError({ status: 200, code: "UNEXPECTED" });
    answers.push({
      fieldId: answer.fieldId,
      kind: answer.kind,
      systemKey: answer.systemKey,
      label: answer.label,
      position: answer.position,
      // An older server sends no type: read it as a plain text answer.
      answerType: typeof answer.answerType === "string" ? (answer.answerType as AnswerType) : "SHORT_TEXT",
      hidden: answer.hidden === true,
      config: isRecord(answer.config) ? (answer.config as FieldConfig) : {},
      value: answer.value,
    });
  }
  return {
    applicationId: value.applicationId,
    formId: value.formId,
    status: value.status,
    submittedAt: value.submittedAt,
    answers,
  };
}

function isPage(value: unknown): value is ItemPage<unknown>["page"] {
  return (
    isRecord(value) &&
    typeof value.number === "number" &&
    typeof value.size === "number" &&
    typeof value.totalItems === "number" &&
    typeof value.totalPages === "number"
  );
}

function isField(value: unknown): value is FormField & Record<string, unknown> {
  if (!isRecord(value)) return false;
  return (
    typeof value.fieldId === "string" &&
    (value.kind === "SYSTEM" || value.kind === "CUSTOM") &&
    (value.systemKey === null || typeof value.systemKey === "string") &&
    typeof value.label === "string" &&
    typeof value.position === "number"
  );
}

/**
 * Fills keys an older server or test fixture may leave out, so a plain text question still
 * renders. SYSTEM fields are always required (DEC-068).
 */
function withDefaults(field: FormField): FormField {
  const partial = field as Partial<FormField> & FormField;
  return {
    ...partial,
    answerType: partial.answerType ?? "SHORT_TEXT",
    required: partial.required ?? partial.kind === "SYSTEM",
    description: partial.description ?? null,
    config:
      partial.config ??
      (partial.systemKey === "PHONE" ? { maxLength: 50, format: "PHONE" } : { maxLength: 200, format: "NONE" }),
    showWhen: partial.showWhen ?? null,
    hidden: partial.hidden ?? false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
