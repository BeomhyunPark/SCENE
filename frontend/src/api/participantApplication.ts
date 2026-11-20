import { parseFormFields, type AnswerItem } from "./applications";
import { apiRequest } from "./client";
import { ApiError } from "./errors";
import type { FormField } from "./forms";

/**
 * The participant's own application (DEC-078 §4·§6, api.md "참가자 신청"). `fields` are the public form
 * fields (hidden questions and options left out); `answers` are the current revision's answers to them
 * in the stored shape. `acceptingEdits` is true only while the event is ACTIVE and the form takes edits.
 * A missing application (withdrawn) is `404 RESOURCE_NOT_FOUND`.
 */
export type ParticipantApplication = {
  applicationId: string;
  formId: string;
  revision: number;
  submittedAt: string;
  acceptingEdits: boolean;
  fields: FormField[];
  answers: { fieldId: string; value: Record<string, unknown> }[];
};

export function getParticipantApplication(signal?: AbortSignal): Promise<ParticipantApplication> {
  return apiRequest<unknown>("/api/v1/participant/application", { signal }).then(parseApplication);
}

/**
 * `PUT /participant/application`. `409 EDITS_CLOSED` when edits are closed, `409 CONCURRENT_MODIFICATION`
 * (body `revision`) when someone else saved first, `400 APPLICATION_VALIDATION_FAILED` for answers.
 * Unchanged answers make no new revision and come back as they are.
 */
export function reviseParticipantApplication(input: {
  expectedRevision: number;
  answers: AnswerItem[];
}): Promise<ParticipantApplication> {
  return apiRequest<unknown>("/api/v1/participant/application", {
    method: "PUT",
    body: { expectedRevision: input.expectedRevision, answers: input.answers },
  }).then(parseApplication);
}

function parseApplication(value: unknown): ParticipantApplication {
  if (
    !isRecord(value) ||
    typeof value.applicationId !== "string" ||
    typeof value.formId !== "string" ||
    typeof value.revision !== "number" ||
    !Array.isArray(value.fields) ||
    !Array.isArray(value.answers)
  ) {
    throw new ApiError({ status: 200, code: "UNEXPECTED" });
  }
  const answers = value.answers.flatMap((item: unknown) =>
    isRecord(item) && typeof item.fieldId === "string" && isRecord(item.value)
      ? [{ fieldId: item.fieldId, value: item.value }]
      : [],
  );
  return {
    applicationId: value.applicationId,
    formId: value.formId,
    revision: value.revision,
    submittedAt: typeof value.submittedAt === "string" ? value.submittedAt : "",
    acceptingEdits: value.acceptingEdits === true,
    fields: parseFormFields(value.fields).sort((left, right) => left.position - right.position),
    answers,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
