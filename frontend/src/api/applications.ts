import { apiRequest } from "./client";
import { ApiError } from "./errors";
import type { FormField } from "./forms";

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

function isField(value: unknown): value is FormField {
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
