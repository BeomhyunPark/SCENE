import { conditionHolds, type FormField } from "../api/forms";
import { reversedRange } from "./attendedSlots";
import { eventFormDetail, formFields, publicForm } from "./formStore";
import { notifyOperators, operatorsWith, retargetNotifications } from "./notificationStore";
import { eventById } from "./operatorStore";

type Issued = {
  applicationId: string;
  participantId: string;
  /** Digits of the phone: one phone is one participant in an event (DEC-078 §1). */
  phoneKey: string;
  /** Mock only: the number is kept in memory to compare. The server keeps a bcrypt hash. */
  pin: string;
  pinTemporary: boolean;
  revision: number;
  eventId: string;
  spaceId: string;
  formId: string;
  submittedAt: string;
  name: string;
  answers: StoredAnswer[];
  /** DEC-084: set while the application is withdrawn. */
  withdrawal?: MockWithdrawal | null;
  /** DEC-078 §4: who stored this revision and what changed (labels only); null for revision 1. */
  revisedBy?: "PARTICIPANT" | "OPERATOR" | null;
  /** DEC-088: the operator who stored this revision (or added the participant). */
  revisedByUserId?: string | null;
  revisedByDisplayName?: string | null;
  changes?: RevisionChange[];
  /** Earlier revisions, oldest first; each is SUPERSEDED (#437). */
  history?: Snapshot[];
};

type RevisionChange = { key: "NAME" | "FIELD"; fieldId: string; label: string };

type Snapshot = {
  applicationId: string;
  revision: number;
  submittedAt: string;
  name: string;
  answers: StoredAnswer[];
  revisedBy: "PARTICIPANT" | "OPERATOR" | null;
  revisedByUserId: string | null;
  revisedByDisplayName: string | null;
  changes: RevisionChange[];
};

/** Who stores a revision: the participant, or an operator (DEC-088). */
type Reviser = { userId: string; displayName: string | null } | null;

const REVISED_TITLE = "님이 신청 내역을 수정했어요";
const RESUBMITTED_TITLE = "님이 다시 신청해 내용을 바꿨어요";

/**
 * Stores changed answers as the next revision, like `ApplicationRevisions.revise`, and tells the
 * operators with PARTICIPANT_READ (#436): the old row joins `history` as SUPERSEDED, every
 * notification about the person moves to the new id, then one merged line per operator. Nothing
 * changed: no revision and no notification.
 */
function revise(
  row: Issued,
  answers: StoredAnswer[],
  name: string,
  kind: "APPLICATION_REVISED" | "APPLICATION_RESUBMITTED" | null,
  operator: Reviser = null,
): boolean {
  const fields = formFields(row.eventId, row.formId);
  const before = new Map(row.answers.map((answer) => [answer.fieldId, JSON.stringify(answer.value)]));
  const after = new Map(answers.map((answer) => [answer.fieldId, JSON.stringify(answer.value)]));
  const changes: RevisionChange[] = fields
    .filter((field) => before.get(field.fieldId) !== after.get(field.fieldId))
    .map((field) => ({ key: field.systemKey === "NAME" ? "NAME" : "FIELD", fieldId: field.fieldId, label: field.label }));
  if (changes.length === 0) return false;
  row.history = [
    ...(row.history ?? []),
    {
      applicationId: row.applicationId,
      revision: row.revision,
      submittedAt: row.submittedAt,
      name: row.name,
      answers: row.answers,
      revisedBy: row.revisedBy ?? null,
      revisedByUserId: row.revisedByUserId ?? null,
      revisedByDisplayName: row.revisedByDisplayName ?? null,
      changes: row.changes ?? [],
    },
  ];
  row.applicationId = crypto.randomUUID();
  row.revision += 1;
  row.answers = answers;
  row.name = name.trim();
  row.submittedAt = new Date().toISOString();
  row.revisedBy = operator ? "OPERATOR" : "PARTICIPANT";
  row.revisedByUserId = operator?.userId ?? null;
  row.revisedByDisplayName = operator?.displayName ?? null;
  row.changes = changes;
  retargetNotifications(
    row.eventId,
    "APPLICATION",
    row.history.map((old) => old.applicationId),
    row.applicationId,
  );
  if (kind) {
    // DEC-088 §6: an operator's edit reads as such, and the operator who edited is left out.
    notifyOperators(row.eventId, operatorsWith(row.eventId, "PARTICIPANT_READ", operator?.userId ?? null), {
      kind,
      target: { type: "APPLICATION", id: row.applicationId },
      title: operator
        ? `${operator.displayName || "운영자"}님이 ${row.name || "참가자"}님의 신청 내역을 수정했어요`
        : `${row.name || "참가자"}${kind === "APPLICATION_REVISED" ? REVISED_TITLE : RESUBMITTED_TITLE}`,
      body: changes.map((change) => change.label).join(", "),
    });
  }
  return true;
}

/**
 * Test and demo seam for `PUT /participant/application` (the participant edits their own
 * application): the answers by field id replace the stored ones. Returns the new application id, or
 * the same id when nothing changed.
 */
export function reviseApplication(eventId: string, applicationId: string, changed: Record<string, Record<string, unknown>>): string | null {
  const row = issued.find((item) => item.eventId === eventId && item.applicationId === applicationId);
  if (!row) return null;
  const answers = row.answers.map((answer) => (answer.fieldId in changed ? { fieldId: answer.fieldId, value: changed[answer.fieldId] } : answer));
  for (const [fieldId, value] of Object.entries(changed)) {
    if (!answers.some((answer) => answer.fieldId === fieldId)) answers.push({ fieldId, value });
  }
  const fields = formFields(eventId, row.formId);
  const name = answerFor(fields, answers, "NAME") ?? row.name;
  revise(row, answers, name, "APPLICATION_REVISED");
  return row.applicationId;
}

/** Every revision of the application's participant, newest first, like `…/revisions`. */
export function applicationRevisions(eventId: string, applicationId: string): {
  applicationId: string;
  revision: number;
  status: string;
  submittedAt: string;
  revisedBy: string | null;
  revisedByUserId: string | null;
  revisedByDisplayName: string | null;
  changes: RevisionChange[];
}[] | null {
  const row = issued.find(
    (item) => item.eventId === eventId && (item.applicationId === applicationId || (item.history ?? []).some((old) => old.applicationId === applicationId)),
  );
  if (!row) return null;
  const current = {
    applicationId: row.applicationId,
    revision: row.revision,
    status: row.withdrawal ? "WITHDRAWN" : "SUBMITTED",
    submittedAt: row.submittedAt,
    revisedBy: row.revisedBy ?? null,
    revisedByUserId: row.revisedByUserId ?? null,
    revisedByDisplayName: row.revisedByDisplayName ?? null,
    changes: row.changes ?? [],
  };
  const older = [...(row.history ?? [])].reverse().map((old) => ({
    applicationId: old.applicationId,
    revision: old.revision,
    status: "SUPERSEDED",
    submittedAt: old.submittedAt,
    revisedBy: old.revisedBy,
    revisedByUserId: old.revisedByUserId,
    revisedByDisplayName: old.revisedByDisplayName,
    changes: old.changes,
  }));
  return [current, ...older];
}

export type MockWithdrawal = {
  withdrawnAt: string;
  withdrawnByDisplayName: string | null;
  reason: string | null;
  reapplyBlocked: boolean;
};

type StoredAnswer = { fieldId: string; value: Record<string, unknown> };

export type ParticipantFailure = { status: number; code: string; retryAfterSeconds?: number };

let issued: Issued[] = [];
let session: { participantId: string; eventId: string } | null = null;
const failures = new Map<string, number>();
const lockedUntil = new Map<string, number>();
const LOCK_FAILURES = 5;
const LOCK_MS = 5 * 60 * 1000;

export function resetParticipantStore(): void {
  issued = [];
  session = null;
  failures.clear();
  lockedUntil.clear();
}

export type Submitted = { applicationId: string; participantId: string; revision: number; revised: boolean; restored?: boolean };

/** DEC-078 §2: six digits, not one digit repeated, not a run up or down, not inside the phone. */
export function pinAccepted(pin: unknown, phoneDigits: string): pin is string {
  if (typeof pin !== "string" || !/^\d{6}$/.test(pin)) return false;
  const steps = [...pin].slice(1).map((digit, index) => Number(digit) - Number(pin[index]));
  if (steps.every((step) => step === 0) || steps.every((step) => step === 1) || steps.every((step) => step === -1)) return false;
  return !phoneDigits.includes(pin);
}

function lockKey(eventId: string, phoneKey: string): string {
  return `${eventId}:${phoneKey}`;
}

function lockFailure(eventId: string, phoneKey: string): ParticipantFailure | null {
  const until = lockedUntil.get(lockKey(eventId, phoneKey));
  if (until && until > Date.now()) return { status: 429, code: "PARTICIPANT_LOGIN_LOCKED", retryAfterSeconds: Math.ceil((until - Date.now()) / 1000) };
  return null;
}

function failed(eventId: string, phoneKey: string): void {
  const key = lockKey(eventId, phoneKey);
  const count = (failures.get(key) ?? 0) + 1;
  if (count >= LOCK_FAILURES) {
    failures.delete(key);
    lockedUntil.set(key, Date.now() + LOCK_MS);
  } else {
    failures.set(key, count);
  }
}

function succeeded(eventId: string, phoneKey: string): void {
  failures.delete(lockKey(eventId, phoneKey));
  lockedUntil.delete(lockKey(eventId, phoneKey));
}

export function submitPublicApplication(
  eventId: string,
  formId: string,
  body: unknown,
): Submitted | ParticipantFailure {
  const event = eventById(eventId);
  if (!event) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const form = publicForm(eventId, formId);
  if (!("fields" in form)) return { status: form.status, code: form.code };
  const read = readAnswers(body);
  const answers = read && keepShown(form.fields, read);
  if (!answers) return { status: 400, code: "APPLICATION_VALIDATION_FAILED" };
  const name = answerFor(form.fields, answers, "NAME");
  const phone = answerFor(form.fields, answers, "PHONE");
  if (!name || !phone || phone.trim().length > 50 || phone.replace(/\D/g, "").length < 4) {
    return { status: 400, code: "APPLICATION_VALIDATION_FAILED" };
  }
  // DEC-074: leaving before arriving is refused like the server's AnswerEvaluator.
  const detail = eventFormDetail(eventId);
  if (detail && reversedRange(detail, new Map(answers.map((answer) => [answer.fieldId, answer.value])))) {
    return { status: 400, code: "APPLICATION_VALIDATION_FAILED" };
  }
  const phoneKey = phone.replace(/\D/g, "");
  const pin = isRecord(body) ? body.pin : undefined;
  const existing = issued.find((row) => row.eventId === eventId && row.phoneKey === phoneKey);
  if (existing) {
    const locked = lockFailure(eventId, phoneKey);
    if (locked) return locked;
    if (pin !== existing.pin) {
      failed(eventId, phoneKey);
      return { status: 409, code: "APPLICATION_ALREADY_EXISTS" };
    }
    succeeded(eventId, phoneKey);
    if (existing.withdrawal) {
      // DEC-084 §5: the matching number brings a withdrawn application back.
      existing.withdrawal = null;
      revise(existing, answers, name, null);
      session = { participantId: existing.participantId, eventId };
      return { applicationId: existing.applicationId, participantId: existing.participantId, revision: existing.revision, revised: true, restored: true };
    }
    if (event.lifecycleStatus !== "ACTIVE" || !acceptingEdits(eventId)) return { status: 409, code: "EDITS_CLOSED" };
    revise(existing, answers, name, "APPLICATION_RESUBMITTED");
    session = { participantId: existing.participantId, eventId };
    return { applicationId: existing.applicationId, participantId: existing.participantId, revision: existing.revision, revised: true };
  }
  if (!pinAccepted(pin, phoneKey)) return { status: 400, code: "PARTICIPANT_PIN_WEAK" };
  const row: Issued = {
    applicationId: crypto.randomUUID(),
    participantId: crypto.randomUUID(),
    phoneKey,
    pin,
    pinTemporary: false,
    revision: 1,
    eventId,
    spaceId: event.spaceId,
    formId,
    submittedAt: new Date().toISOString(),
    name: name.trim(),
    answers,
  };
  issued.push(row);
  session = { participantId: row.participantId, eventId };
  return { applicationId: row.applicationId, participantId: row.participantId, revision: 1, revised: false };
}

function acceptingEdits(eventId: string): boolean {
  return eventFormDetail(eventId)?.acceptingEdits ?? true;
}

/**
 * Like the server's AnswerEvaluator: walks the questions in position order and keeps only answers
 * to shown questions, without the picks of options that are hidden by their condition.
 */
function keepShown(fields: FormField[], answers: StoredAnswer[]): StoredAnswer[] {
  const given = new Map(answers.map((answer) => [answer.fieldId, answer.value]));
  const kept = new Map<string, Record<string, unknown>>();
  const out: StoredAnswer[] = [];
  for (const field of [...fields].sort((a, b) => a.position - b.position)) {
    const value = given.get(field.fieldId);
    if (!value || field.hidden || !conditionHolds(field.showWhen, (id) => kept.get(id))) continue;
    const shown = new Set(
      (field.config.options ?? [])
        .filter((option) => !option.hidden && conditionHolds(option.showWhen, (id) => kept.get(id)))
        .map((option) => option.optionId),
    );
    let next: Record<string, unknown> | null = value;
    if (field.config.options && typeof value.optionId === "string" && !shown.has(value.optionId)) next = null;
    if (field.config.options && Array.isArray(value.optionIds)) {
      const ids = value.optionIds.filter((id) => shown.has(String(id)));
      next = ids.length > 0 || value.other ? { ...value, optionIds: ids } : null;
    }
    if (!next) continue;
    kept.set(field.fieldId, next);
    out.push({ fieldId: field.fieldId, value: next });
  }
  return out;
}

/** DEC-078 §3: name, phone and number. Any wrong part is the same 401; five in a row lock the phone. */
export function openParticipantSession(eventId: string, body: unknown): ParticipantFailure | null {
  const event = eventById(eventId);
  if (!event) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  if (!isRecord(body) || typeof body.name !== "string" || typeof body.phone !== "string" || typeof body.pin !== "string") {
    return { status: 400, code: "VALIDATION_FAILED" };
  }
  const phoneKey = body.phone.replace(/\D/g, "");
  const locked = lockFailure(eventId, phoneKey);
  if (locked) return locked;
  const row = issued.find((item) => item.eventId === eventId && item.phoneKey === phoneKey);
  if (!row || row.withdrawal || row.pin !== body.pin.trim() || foldName(row.name) !== foldName(body.name)) {
    failed(eventId, phoneKey);
    return { status: 401, code: "PARTICIPANT_LOGIN_FAILED" };
  }
  succeeded(eventId, phoneKey);
  session = { participantId: row.participantId, eventId: row.eventId };
  return null;
}

function foldName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** `PUT /participant/pin`. A temporary-number session needs no current number. */
export function changeParticipantPin(body: unknown): ParticipantFailure | null {
  const row = sessionRow();
  if (!row) return { status: 401, code: "AUTHENTICATION_REQUIRED" };
  if (!isRecord(body)) return { status: 400, code: "VALIDATION_FAILED" };
  if (!row.pinTemporary) {
    if (typeof body.currentPin !== "string") return { status: 400, code: "VALIDATION_FAILED" };
    if (body.currentPin !== row.pin) {
      failed(row.eventId, row.phoneKey);
      return { status: 401, code: "PARTICIPANT_LOGIN_FAILED" };
    }
  }
  if (!pinAccepted(body.newPin, row.phoneKey)) return { status: 400, code: "PARTICIPANT_PIN_WEAK" };
  row.pin = body.newPin;
  row.pinTemporary = false;
  return null;
}

/** Operator reset (DEC-078 §2): a temporary number shown once; the participant's session ends. */
/** The operator path's form check (DEC-088 §2): consent and hidden questions are not the operator's. */
function operatorShown(fields: FormField[], answers: StoredAnswer[]): StoredAnswer[] | null {
  const consent = new Set(fields.filter((field) => field.answerType === "YES_NO" && field.config.style === "CONSENT").map((field) => field.fieldId));
  return keepShown(fields, answers.filter((answer) => !consent.has(answer.fieldId)));
}

function carriedOver(fields: FormField[], before: StoredAnswer[]): StoredAnswer[] {
  const carried = new Set(
    fields.filter((field) => field.hidden || (field.answerType === "YES_NO" && field.config.style === "CONSENT")).map((field) => field.fieldId),
  );
  return before.filter((answer) => carried.has(answer.fieldId));
}

export type OperatorRevised = { applicationId: string; participantId: string; revision: number; revised: boolean };

/**
 * 운영자 신청 고치기 (DEC-088 §2), like `OperatorApplicationEditService.revise`: no form or edit switch,
 * only the name and phone required, consent and hidden answers carried over, the phone may change
 * but not to another participant's.
 */
export function operatorReviseApplication(
  eventId: string,
  applicationId: string,
  body: unknown,
  operator: { userId: string; displayName: string | null },
): OperatorRevised | (ParticipantFailure & { extensions?: Record<string, unknown> }) {
  const event = eventById(eventId);
  const row = issued.find(
    (item) => item.eventId === eventId && (item.applicationId === applicationId || (item.history ?? []).some((old) => old.applicationId === applicationId)),
  );
  if (!event || !row) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const expected = isRecord(body) ? body.expectedRevision : undefined;
  if (typeof expected !== "number" || !Number.isInteger(expected) || expected < 1) return { status: 400, code: "VALIDATION_FAILED" };
  if (event.lifecycleStatus === "ARCHIVED") return { status: 409, code: "EVENT_ARCHIVED" };
  if (row.withdrawal) return { status: 409, code: "INVALID_STATE_TRANSITION", extensions: { applicationStatus: "WITHDRAWN" } };
  if (row.applicationId !== applicationId || row.revision !== expected) {
    return {
      status: 409,
      code: "CONCURRENT_MODIFICATION",
      extensions: { applicationId: row.applicationId, status: "SUBMITTED", revision: row.revision },
    };
  }
  const fields = formFields(eventId, row.formId);
  const read = readAnswers(isRecord(body) ? { answers: body.answers } : null);
  const shown = read && operatorShown(fields, read);
  if (!shown) return { status: 400, code: "APPLICATION_VALIDATION_FAILED" };
  const name = answerFor(fields, shown, "NAME");
  const phone = answerFor(fields, shown, "PHONE");
  if (!name || !phone || phone.replace(/\D/g, "").length < 4) return { status: 400, code: "APPLICATION_VALIDATION_FAILED" };
  const detail = eventFormDetail(eventId);
  if (detail && reversedRange(detail, new Map(shown.map((answer) => [answer.fieldId, answer.value])))) {
    return { status: 400, code: "APPLICATION_VALIDATION_FAILED" };
  }
  const phoneKey = phone.replace(/\D/g, "");
  if (issued.some((item) => item !== row && item.eventId === eventId && item.phoneKey === phoneKey)) {
    return { status: 409, code: "APPLICATION_ALREADY_EXISTS" };
  }
  const revised = revise(row, [...shown, ...carriedOver(fields, row.answers)], name, "APPLICATION_REVISED", operator);
  if (revised) row.phoneKey = phoneKey;
  return { applicationId: row.applicationId, participantId: row.participantId, revision: row.revision, revised };
}

export type OperatorAdded = { applicationId: string; participantId: string; revision: 1; temporaryPin: string };

/** 참가자 직접 추가 (DEC-088 §3), like `OperatorApplicationEditService.add`. */
export function operatorAddParticipant(
  eventId: string,
  body: unknown,
  operator: { userId: string; displayName: string | null },
): OperatorAdded | (ParticipantFailure & { extensions?: Record<string, unknown> }) {
  const event = eventById(eventId);
  if (!event) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const formId = isRecord(body) && typeof body.formId === "string" ? body.formId : null;
  if (!formId) return { status: 400, code: "VALIDATION_FAILED" };
  const fields = formFields(eventId, formId);
  if (fields.length === 0) return { status: 404, code: "FORM_NOT_FOUND" };
  if (event.lifecycleStatus === "ENDED") return { status: 409, code: "EVENT_ENDED" };
  if (event.lifecycleStatus === "ARCHIVED") return { status: 409, code: "EVENT_ARCHIVED" };
  const read = readAnswers(isRecord(body) ? { answers: body.answers } : null);
  const answers = read && operatorShown(fields, read);
  if (!answers) return { status: 400, code: "APPLICATION_VALIDATION_FAILED" };
  const name = answerFor(fields, answers, "NAME");
  const phone = answerFor(fields, answers, "PHONE");
  if (!name || !phone || phone.replace(/\D/g, "").length < 4) return { status: 400, code: "APPLICATION_VALIDATION_FAILED" };
  const detail = eventFormDetail(eventId);
  if (detail && reversedRange(detail, new Map(answers.map((answer) => [answer.fieldId, answer.value])))) {
    return { status: 400, code: "APPLICATION_VALIDATION_FAILED" };
  }
  const phoneKey = phone.replace(/\D/g, "");
  const existing = issued.find((row) => row.eventId === eventId && row.phoneKey === phoneKey);
  if (existing) {
    return {
      status: 409,
      code: "APPLICATION_ALREADY_EXISTS",
      extensions: { applicationId: existing.applicationId, status: existing.withdrawal ? "WITHDRAWN" : "SUBMITTED" },
    };
  }
  let pin = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
  while (!pinAccepted(pin, phoneKey)) {
    pin = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
  }
  const row: Issued = {
    applicationId: crypto.randomUUID(),
    participantId: crypto.randomUUID(),
    phoneKey,
    pin,
    pinTemporary: true,
    revision: 1,
    eventId,
    spaceId: event.spaceId,
    formId,
    submittedAt: new Date().toISOString(),
    name: name.trim(),
    answers,
    revisedBy: "OPERATOR",
    revisedByUserId: operator.userId,
    revisedByDisplayName: operator.displayName,
    changes: [],
  };
  issued.push(row);
  notifyOperators(eventId, operatorsWith(eventId, "PARTICIPANT_READ", operator.userId), {
    kind: "APPLICATION_ADDED",
    target: { type: "APPLICATION", id: row.applicationId },
    title: `${row.name || "참가자"}님을 운영자가 직접 추가했어요`,
    body: null,
  });
  return { applicationId: row.applicationId, participantId: row.participantId, revision: 1, temporaryPin: pin };
}

export function resetParticipantPin(eventId: string, participantId: string): string | null {
  const row = issued.find((item) => item.eventId === eventId && item.participantId === participantId);
  if (!row) return null;
  let pin = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
  while (!pinAccepted(pin, row.phoneKey)) {
    pin = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
  }
  row.pin = pin;
  row.pinTemporary = true;
  succeeded(eventId, row.phoneKey);
  if (session?.participantId === participantId) session = null;
  return pin;
}

function sessionRow(): Issued | undefined {
  // DEC-084 §4: a session counts only while the application is not withdrawn.
  return session ? issued.find((row) => row.participantId === session?.participantId && !row.withdrawal) : undefined;
}

function active(eventId: string): Issued[] {
  return issued.filter((row) => row.eventId === eventId && !row.withdrawal);
}

/** DEC-084: withdraws the participant's current application. Null when it is not in the event. */
export function withdrawParticipantApplication(
  eventId: string,
  applicationId: string,
  withdrawal: MockWithdrawal,
): { participantId: string; already: boolean; withdrawal: MockWithdrawal } | { stale: true; applicationId: string; revision: number } | null {
  const row = issued.find((item) => item.eventId === eventId && item.applicationId === applicationId);
  if (!row) return null;
  if (row.withdrawal) return { participantId: row.participantId, already: true, withdrawal: row.withdrawal };
  row.withdrawal = withdrawal;
  if (withdrawal.reapplyBlocked) row.pin = crypto.randomUUID();
  if (session?.participantId === row.participantId) session = null;
  return { participantId: row.participantId, already: false, withdrawal };
}

/** DEC-084 §3: back to SUBMITTED. Null when it is not in the event. */
export function restoreParticipantApplication(
  eventId: string,
  applicationId: string,
): { participantId: string; already: boolean; reapplyBlocked: boolean } | null {
  const row = issued.find((item) => item.eventId === eventId && item.applicationId === applicationId);
  if (!row) return null;
  if (!row.withdrawal) return { participantId: row.participantId, already: true, reapplyBlocked: false };
  const reapplyBlocked = row.withdrawal.reapplyBlocked;
  row.withdrawal = null;
  return { participantId: row.participantId, already: false, reapplyBlocked };
}

/** Withdrawn applicants of the event, newest withdraw first, for the table mock. */
export function withdrawnApplications(eventId: string): {
  applicationId: string;
  participantId: string;
  name: string;
  submittedAt: string;
  withdrawal: MockWithdrawal;
}[] {
  return issued
    .filter((row) => row.eventId === eventId && row.withdrawal)
    .map((row) => ({
      applicationId: row.applicationId,
      participantId: row.participantId,
      name: row.name,
      submittedAt: row.submittedAt,
      withdrawal: row.withdrawal as MockWithdrawal,
    }))
    .sort((a, b) => b.withdrawal.withdrawnAt.localeCompare(a.withdrawal.withdrawnAt));
}

/** The withdrawal of one application, or null. */
export function withdrawalOf(eventId: string, applicationId: string): MockWithdrawal | null {
  return issued.find((row) => row.eventId === eventId && row.applicationId === applicationId)?.withdrawal ?? null;
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
  return active(eventId)
    .map((row) => ({
      applicationId: row.applicationId,
      formId: row.formId,
      status: "SUBMITTED",
      submittedAt: row.submittedAt,
      name: nameAnswer(row),
    }));
}

/** Raw stored answers of every submitted application, oldest first, for the summary mock. */
export function submittedAnswers(eventId: string): { applicationId: string; answers: Map<string, Record<string, unknown>> }[] {
  return active(eventId)
    .map((row) => ({
      applicationId: row.applicationId,
      answers: new Map(row.answers.map((answer) => [answer.fieldId, answer.value])),
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
  participantId: string;
  revision: number;
  answers: {
    fieldId: string;
    kind: "SYSTEM" | "CUSTOM";
    systemKey: string | null;
    label: string;
    position: number;
    answerType: string;
    hidden: boolean;
    config: unknown;
    value: Record<string, unknown>;
  }[];
} | null {
  const current = issued.find((item) => item.eventId === eventId && item.applicationId === applicationId);
  const owner = current ?? issued.find((item) => item.eventId === eventId && (item.history ?? []).some((old) => old.applicationId === applicationId));
  if (!owner) return null;
  const old = current ? null : owner.history!.find((item) => item.applicationId === applicationId)!;
  const row = old ? { ...owner, ...old, withdrawal: null } : owner;
  const answers = formFields(eventId, row.formId)
    .flatMap((field) => {
      const answer = row.answers.find((item) => item.fieldId === field.fieldId);
      if (!answer) return [];
      const { fieldId, kind, systemKey, label, position, answerType, hidden, config } = field;
      return [{ fieldId, kind, systemKey, label, position, answerType, hidden, config, value: answer.value }];
    })
    .sort((a, b) => a.position - b.position);
  return {
    applicationId: row.applicationId,
    formId: row.formId,
    status: old ? "SUPERSEDED" : row.withdrawal ? "WITHDRAWN" : "SUBMITTED",
    submittedAt: row.submittedAt,
    participantId: row.participantId,
    revision: row.revision,
    answers,
  };
}

/** Check-in roster rows for participants who applied through the mock form. Phone keeps only the last 4 digits. */
export function checkInCandidates(eventId: string): {
  participantId: string;
  name: string;
  cohort: string | null;
  phoneLast4: string;
}[] {
  return active(eventId)
    .map((row) => {
      const fields = formFields(row.eventId, row.formId);
      const phone = answerFor(fields, row.answers, "PHONE") ?? "";
      return {
        participantId: row.participantId,
        name: row.name,
        cohort: answerFor(fields, row.answers, "COHORT"),
        phoneLast4: phone.replace(/\D/g, "").slice(-4),
      };
    });
}

/**
 * Rows for the 참가 현황 table (#308): every submitted application with its participant and its
 * answers by field id, oldest first.
 */
export function tableApplications(eventId: string): {
  applicationId: string;
  participantId: string;
  formId: string;
  submittedAt: string;
  revision: number;
  revisedBy: string | null;
  answers: Record<string, Record<string, unknown>>;
}[] {
  return active(eventId)
    .map((row) => ({
      applicationId: row.applicationId,
      participantId: row.participantId,
      formId: row.formId,
      submittedAt: row.submittedAt,
      revision: row.revision,
      revisedBy: row.revisedBy ?? null,
      answers: Object.fromEntries(row.answers.map((answer) => [answer.fieldId, answer.value])),
    }));
}

/**
 * Test and demo seam: stores an application with any stored answers, skipping submit validation,
 * the way the backend tests seed through the repository.
 */
export function seedApplication(
  eventId: string,
  formId: string,
  submittedAt: string,
  answers: { fieldId: string; value: Record<string, unknown> }[],
): { applicationId: string; participantId: string } {
  const event = eventById(eventId);
  const fields = formFields(eventId, formId);
  const row: Issued = {
    applicationId: crypto.randomUUID(),
    participantId: crypto.randomUUID(),
    phoneKey: crypto.randomUUID(),
    pin: "730914",
    pinTemporary: false,
    revision: 1,
    eventId,
    spaceId: event?.spaceId ?? "",
    formId,
    submittedAt,
    name: "",
    answers,
  };
  row.name = answerFor(fields, answers, "NAME") ?? "";
  const phone = answerFor(fields, answers, "PHONE");
  if (phone) row.phoneKey = phone.replace(/\D/g, "");
  issued.push(row);
  return { applicationId: row.applicationId, participantId: row.participantId };
}

/** Test seam for an application stored without a NAME answer. */
export function seedApplicationWithoutName(eventId: string, formId: string, submittedAt: string): string {
  const event = eventById(eventId);
  const row: Issued = {
    applicationId: crypto.randomUUID(),
    participantId: crypto.randomUUID(),
    phoneKey: crypto.randomUUID(),
    pin: "730914",
    pinTemporary: false,
    revision: 1,
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
  return answer ? textOf(answer) : null;
}

function textOf(answer: StoredAnswer): string {
  return typeof answer.value.text === "string" ? answer.value.text : "";
}

export function currentParticipant(): {
  participantId: string;
  eventId: string;
  spaceId: string;
  name: string;
  pinChangeRequired: boolean;
} | null {
  const row = sessionRow();
  if (!row) return null;
  return { participantId: row.participantId, eventId: row.eventId, spaceId: row.spaceId, name: row.name, pinChangeRequired: row.pinTemporary };
}

/** The current revision of a participant's application, or null without one (feed mock). */
export function currentApplicationRevision(participantId: string): number | null {
  return issued.find((row) => row.participantId === participantId)?.revision ?? null;
}

/** Public-form shape of the fields: hidden questions and hidden options left out (api.md "참가자 신청"). */
function publicFields(row: Issued): FormField[] {
  return formFields(row.eventId, row.formId)
    .filter((field) => !field.hidden)
    .map((field) =>
      field.config.options
        ? { ...field, config: { ...field.config, options: field.config.options.filter((option) => !option.hidden) } }
        : field,
    )
    .sort((a, b) => a.position - b.position);
}

function ownApplicationBody(row: Issued) {
  const fields = publicFields(row);
  const shown = new Set(fields.map((field) => field.fieldId));
  const event = eventById(row.eventId);
  return {
    applicationId: row.applicationId,
    formId: row.formId,
    revision: row.revision,
    submittedAt: row.submittedAt,
    acceptingEdits: event?.lifecycleStatus === "ACTIVE" && acceptingEdits(row.eventId),
    fields,
    answers: row.answers.filter((answer) => shown.has(answer.fieldId)),
  };
}

/** GET /participant/application (A4). Null when the session has no application. */
export function readOwnApplication(): ReturnType<typeof ownApplicationBody> | null {
  const row = sessionRow();
  return row ? ownApplicationBody(row) : null;
}

/**
 * PUT /participant/application (A4, DEC-078 §4): closed edits → 409 EDITS_CLOSED, a stale revision →
 * 409 CONCURRENT_MODIFICATION with the current `revision`, then the same answer checks as the public
 * submit. The phone must keep its digits. Answers to hidden questions carry over; nothing changed
 * makes no new revision.
 */
export function reviseOwnApplication(body: unknown): ReturnType<typeof ownApplicationBody> | (ParticipantFailure & { revision?: number }) {
  const row = sessionRow();
  if (!row) return { status: 401, code: "AUTHENTICATION_REQUIRED" };
  const event = eventById(row.eventId);
  if (event?.lifecycleStatus !== "ACTIVE" || !acceptingEdits(row.eventId)) return { status: 409, code: "EDITS_CLOSED" };
  if (!isRecord(body) || typeof body.expectedRevision !== "number") return { status: 400, code: "VALIDATION_FAILED" };
  if (body.expectedRevision !== row.revision) return { status: 409, code: "CONCURRENT_MODIFICATION", revision: row.revision };
  const fields = publicFields(row);
  const read = readAnswers(body);
  const answers = read && keepShown(fields, read);
  if (!answers) return { status: 400, code: "APPLICATION_VALIDATION_FAILED" };
  const name = answerFor(fields, answers, "NAME");
  const phone = answerFor(fields, answers, "PHONE");
  if (!name || !phone || phone.replace(/\D/g, "") !== row.phoneKey) return { status: 400, code: "APPLICATION_VALIDATION_FAILED" };
  const detail = eventFormDetail(row.eventId);
  if (detail && reversedRange(detail, new Map(answers.map((answer) => [answer.fieldId, answer.value])))) {
    return { status: 400, code: "APPLICATION_VALIDATION_FAILED" };
  }
  const shown = new Set(fields.map((field) => field.fieldId));
  const kept = row.answers.filter((answer) => !shown.has(answer.fieldId));
  const next = [...answers, ...kept];
  // #436: a changed answer is a new revision and tells the operators with PARTICIPANT_READ.
  revise(row, next, name, "APPLICATION_REVISED");
  return ownApplicationBody(row);
}

/** Test seam: another device or an operator saved a newer revision. */
export function reviseAsSomeoneElse(participantId: string, fieldId: string, value: Record<string, unknown>): void {
  const row = issued.find((item) => item.participantId === participantId);
  if (!row) return;
  row.answers = [...row.answers.filter((answer) => answer.fieldId !== fieldId), { fieldId, value }];
  row.applicationId = crypto.randomUUID();
  row.revision += 1;
}

export function clearParticipant(): void {
  session = null;
}

function answerFor(
  fields: { fieldId: string; systemKey: string | null }[],
  answers: StoredAnswer[],
  systemKey: string,
): string | null {
  const field = fields.find((item) => item.systemKey === systemKey);
  if (!field) return null;
  const answer = answers.find((item) => item.fieldId === field.fieldId);
  if (!answer || textOf(answer).trim().length === 0) return null;
  return textOf(answer);
}

function readAnswers(body: unknown): StoredAnswer[] | null {
  if (!isRecord(body) || !Array.isArray(body.answers)) return null;
  const answers: StoredAnswer[] = [];
  for (const item of body.answers) {
    if (!isRecord(item) || typeof item.fieldId !== "string") return null;
    if (typeof item.text === "string") answers.push({ fieldId: item.fieldId, value: { text: item.text } });
    else if (isRecord(item.value)) answers.push({ fieldId: item.fieldId, value: item.value });
    else return null;
  }
  return answers;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
