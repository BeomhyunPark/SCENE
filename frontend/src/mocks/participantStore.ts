import { publicForm } from "./formStore";
import { eventById } from "./operatorStore";

type Issued = {
  applicationId: string;
  participantId: string;
  accessKey: string;
  eventId: string;
  spaceId: string;
  name: string;
};

export type ParticipantFailure = { status: number; code: string };

let issued: Issued[] = [];
let session: Omit<Issued, "accessKey" | "applicationId"> | null = null;

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
    name: name.trim(),
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
    if (!isRecord(item) || typeof item.fieldId !== "string" || typeof item.text !== "string") return null;
    answers.push({ fieldId: item.fieldId, text: item.text });
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
