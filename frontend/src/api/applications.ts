import { apiRequest } from "./client";
import { ApiError } from "./errors";
import type { FormField } from "./forms";

export type PublicForm = {
  formId: string;
  fields: FormField[];
};

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
  answers: { fieldId: string; text: string }[],
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
    fields.push(field);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
