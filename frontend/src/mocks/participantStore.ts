import { formFields, publicForm } from "./formStore";
import { eventById } from "./operatorStore";

type Issued = {
  applicationId: string;
  participantId: string;
  accessKey: string;
  eventId: string;
  spaceId: string;
  formId: string;
  submittedAt: string;
  name: string;
  answers: { fieldId: string; text: string }[];
};

export type ParticipantFailure = { status: number; code: string };

let issued: Issued[] = [];
let session: { participantId: string; eventId: string; spaceId: string; name: string } | null = null;

export function resetParticipantStore(): void {
  issued = [];
  session = null;
}

export function submitPublicApplication(
  eventId: string,
  formId: string,
  body: unknown,
): { applicationId: string; participantId: string; accessKey: string } | ParticipantFailure {
  const event = eventById(eventId);
  if (!event) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const form = publicForm(eventId, formId);
  if (!("fields" in form)) return { status: form.status, code: form.code };
  const answers = readAnswers(body);
  if (!answers) return { status: 400, code: "APPLICATION_VALIDATION_FAILED" };
  const name = answerFor(form.fields, answers, "NAME");
  const phone = answerFor(form.fields, answers, "PHONE");
  if (!name || !phone || phone.trim().length > 50 || phone.replace(/\D/g, "").length < 4) {
    return { status: 400, code: "APPLICATION_VALIDATION_FAILED" };
  }
  const row: Issued = {
    applicationId: crypto.randomUUID(),
    participantId: crypto.randomUUID(),
    accessKey: randomKey(),
    eventId,
    spaceId: event.spaceId,
    formId,
    submittedAt: new Date().toISOString(),
    name: name.trim(),
    answers,
  };
  issued.push(row);
  return { applicationId: row.applicationId, participantId: row.participantId, accessKey: row.accessKey };
}

export function openParticipantSession(eventId: string, body: unknown): ParticipantFailure | null {
  const event = eventById(eventId);
  if (!event) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const accessKey = readKey(body);
  const match = accessKey ? issued.filter((row) => row.eventId === eventId && row.accessKey === accessKey) : [];
  if (match.length !== 1) return { status: 401, code: "PARTICIPANT_ACCESS_INVALID" };
  const row = match[0];
  session = { participantId: row.participantId, eventId: row.eventId, spaceId: row.spaceId, name: row.name };
  return null;
}

/**
 * Operator list rows for one event, oldest first. Name is the NAME answer as submitted. The access
 * key, participant id, and phone stay off.
 */
export function submittedApplications(eventId: string): {
  applicationId: string;
  formId: string;
  status: string;
  submittedAt: string;
  name: string | null;
}[] {
  return issued
    .filter((row) => row.eventId === eventId)
    .map((row) => ({
      applicationId: row.applicationId,
      formId: row.formId,
      status: "SUBMITTED",
      submittedAt: row.submittedAt,
      name: nameAnswer(row),
    }));
}

/** One submitted application with every answer, in field order. Null when it is not in that event. */
export function submittedApplication(
  eventId: string,
  applicationId: string,
): {
  applicationId: string;
  formId: string;
  status: string;
  submittedAt: string;
  answers: {
    fieldId: string;
    kind: "SYSTEM" | "CUSTOM";
    systemKey: string | null;
    label: string;
    position: number;
    value: { text: string };
  }[];
} | null {
  const row = issued.find((item) => item.eventId === eventId && item.applicationId === applicationId);
  if (!row) return null;
  const answers = formFields(eventId, row.formId)
    .flatMap((field) => {
      const answer = row.answers.find((item) => item.fieldId === field.fieldId);
      return answer ? [{ ...field, value: { text: answer.text } }] : [];
    })
    .sort((a, b) => a.position - b.position);
  return {
    applicationId: row.applicationId,
    formId: row.formId,
    status: "SUBMITTED",
    submittedAt: row.submittedAt,
    answers,
  };
}

/** Test seam for an application stored without a NAME answer. */
export function seedApplicationWithoutName(eventId: string, formId: string, submittedAt: string): string {
  const event = eventById(eventId);
  const row: Issued = {
    applicationId: crypto.randomUUID(),
    participantId: crypto.randomUUID(),
    accessKey: randomKey(),
    eventId,
    spaceId: event?.spaceId ?? "",
    formId,
    submittedAt,
    name: "",
    answers: [],
  };
  issued.push(row);
  return row.applicationId;
}

function nameAnswer(row: Issued): string | null {
  const field = formFields(row.eventId, row.formId).find((item) => item.systemKey === "NAME");
  const answer = field ? row.answers.find((item) => item.fieldId === field.fieldId) : undefined;
  return answer ? answer.text : null;
}

export function currentParticipant(): { participantId: string; eventId: string; spaceId: string; name: string } | null {
  return session;
}

export function clearParticipant(): void {
  session = null;
}

function answerFor(
  fields: { fieldId: string; systemKey: string | null }[],
  answers: { fieldId: string; text: string }[],
  systemKey: string,
): string | null {
  const field = fields.find((item) => item.systemKey === systemKey);
  if (!field) return null;
  const answer = answers.find((item) => item.fieldId === field.fieldId);
  if (!answer || answer.text.trim().length === 0) return null;
  return answer.text;
}

function readAnswers(body: unknown): { fieldId: string; text: string }[] | null {
  if (!isRecord(body) || !Array.isArray(body.answers)) return null;
  const answers: { fieldId: string; text: string }[] = [];
  for (const item of body.answers) {
    if (!isRecord(item) || typeof item.fieldId !== "string") return null;
    if (typeof item.text === "string") answers.push({ fieldId: item.fieldId, text: item.text });
    else if (isRecord(item.value)) answers.push({ fieldId: item.fieldId, text: "" });
    else return null;
  }
  return answers;
}

function readKey(body: unknown): string | null {
  if (!isRecord(body) || typeof body.accessKey !== "string") return null;
  const key = body.accessKey.trim();
  return key.length > 0 ? key : null;
}

function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
