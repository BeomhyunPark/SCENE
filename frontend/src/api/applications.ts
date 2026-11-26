import { apiDownload, apiRequest } from "./client";
import { ApiError } from "./errors";
import type { AnswerType, FieldConfig, FormField } from "./forms";
import type { ItemPage } from "./types";
import { parseRosterArrival, type RosterArrival } from "./checkIns";
import { parseLodging, parseTableRoom, type Lodging, type TableRoom } from "./deskRoom";

export type PublicForm = {
  formId: string;
  fields: FormField[];
};

/** Request items for `POST …/applications`. Text questions may use the `text` shortcut. */
export type AnswerItem = { fieldId: string; text: string } | { fieldId: string; value: Record<string, unknown> };

/**
 * `POST …/applications` (DEC-078). The response also sets the participant session cookie, so the
 * person is signed in right away. `revised` is true when the phone had applied and the number
 * matched, so the submit became an edit.
 */
export type SubmittedApplication = {
  applicationId: string;
  participantId: string;
  revision: number;
  revised: boolean;
  /** The form's completion notice at submit time, plain text, or null (#406). */
  completionNotice: string | null;
  /** True when the phone's application had been withdrawn and the matching number brought it back (DEC-084 §5). */
  restored: boolean;
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
 * `contact` marks a phone question. Without contact permission the server sends no value for it
 * (#332): `withheld` is true and `value` is empty.
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
  contact: boolean;
  withheld: boolean;
};

/**
 * Operator-only information kept beside the original answers (#335, DEC-075). The first round holds
 * one memo. Nothing saved yet is memo "" and version 0. Never sent to participants or the CSV.
 */
export type ApplicationOperation = {
  memo: string;
  version: number;
  updatedAt: string | null;
  updatedByDisplayName: string | null;
};

/** Provisional server limit (DEC-075). */
export const OPERATION_MEMO_MAX = 2_000;

export const EMPTY_OPERATION: ApplicationOperation = { memo: "", version: 0, updatedAt: null, updatedByDisplayName: null };

/**
 * Who withdrew an application, when and why (DEC-084 §2). `reason` is operator text shown to
 * operators only. `reapplyBlocked` means the six-digit number was made unusable at withdraw.
 */
export type ApplicationWithdrawal = {
  withdrawnAt: string | null;
  withdrawnByDisplayName: string | null;
  reason: string | null;
  reapplyBlocked: boolean;
};

/** Provisional server limit (DEC-084), the same as a check-in cancel reason. */
export const WITHDRAW_REASON_MAX = 200;

export type ApplicationDetail = {
  applicationId: string;
  formId: string;
  status: string;
  submittedAt: string;
  /** False when phone answers were left out for lack of `PARTICIPANT_CONTACT_READ`. */
  contactVisible: boolean;
  answers: ApplicationAnswer[];
  operation: ApplicationOperation;
  /** Set while this is the participant's latest, withdrawn application (DEC-084 §9). */
  withdrawal: ApplicationWithdrawal | null;
  /** Counts edits from 1 (DEC-078 §4). 1 from an older server. */
  revision: number;
};

/** One changed question of a revision, titled as it was when stored. No values (DEC-078 §4). */
export type RevisionChange = { key: "NAME" | "FIELD"; fieldId: string; label: string };

/**
 * One revision of the participant's application, newest first (#437). `revisedBy` is null for the
 * first application, `PARTICIPANT` or `OPERATOR` after. Values come from each revision's detail.
 */
export type ApplicationRevision = {
  applicationId: string;
  revision: number;
  status: string;
  submittedAt: string;
  revisedBy: "PARTICIPANT" | "OPERATOR" | null;
  /** The operator who stored it (DEC-088 §6); null for the participant or an unknown operator. */
  revisedByDisplayName: string | null;
  changes: RevisionChange[];
};

/** Every revision of the application's participant (DEC-078 §4). Same access as the detail. */
export function getApplicationRevisions(
  eventId: string,
  applicationId: string,
  signal?: AbortSignal,
): Promise<ApplicationRevision[]> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/applications/${applicationId}/revisions`, {
    signal,
  }).then(parseRevisions);
}

function parseRevisions(value: unknown): ApplicationRevision[] {
  if (!isRecord(value) || !Array.isArray(value.items)) throw new ApiError({ status: 200, code: "UNEXPECTED" });
  const out: ApplicationRevision[] = [];
  for (const item of value.items) {
    if (
      !isRecord(item) ||
      typeof item.applicationId !== "string" ||
      typeof item.revision !== "number" ||
      typeof item.status !== "string" ||
      typeof item.submittedAt !== "string"
    ) {
      throw new ApiError({ status: 200, code: "UNEXPECTED" });
    }
    const changes: RevisionChange[] = [];
    for (const change of Array.isArray(item.changes) ? item.changes : []) {
      if (isRecord(change) && typeof change.fieldId === "string" && typeof change.label === "string") {
        changes.push({ key: change.key === "NAME" ? "NAME" : "FIELD", fieldId: change.fieldId, label: change.label });
      }
    }
    out.push({
      applicationId: item.applicationId,
      revision: item.revision,
      status: item.status,
      submittedAt: item.submittedAt,
      revisedBy: item.revisedBy === "PARTICIPANT" || item.revisedBy === "OPERATOR" ? item.revisedBy : null,
      revisedByDisplayName: typeof item.revisedByDisplayName === "string" ? item.revisedByDisplayName : null,
      changes,
    });
  }
  return out;
}

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

/**
 * Applicant CSV (#233). Needs effective `DATA_EXPORT`; `EVENT_READ` alone is `403 FORBIDDEN`. The
 * server writes one audit row per download.
 */
export function downloadApplicationsCsv(eventId: string): Promise<{ blob: Blob; fileName: string }> {
  return apiDownload(`/api/v1/operator/events/${eventId}/applications/export`, { method: "POST" }).then((file) => ({
    blob: file.blob,
    fileName: file.fileName ?? "신청자.csv",
  }));
}

/** One question of the 참가 현황 table (#308): the detail's answer fields without `value`. */
export type TableColumn = {
  fieldId: string;
  kind: "SYSTEM" | "CUSTOM";
  systemKey: string | null;
  presetKey: string | null;
  label: string;
  position: number;
  answerType: AnswerType;
  hidden: boolean;
  config: FieldConfig;
  /** A phone question. Sent only to an operator with `PARTICIPANT_CONTACT_READ`. */
  contact: boolean;
};

export type TableRow = {
  applicationId: string;
  /** The board's participant id, for `group-assignments` (#335). Empty from an older server. */
  participantId: string;
  submittedAt: string;
  /** Field id to stored value (DEC-068 §1). No key means no answer. */
  answers: Record<string, Record<string, unknown>>;
  /** Working-copy group (DEC-072). Null when unassigned or when `groupVisible` is false. */
  group: { groupId: string; name: string; leader: boolean } | null;
  checkedInAt: string | null;
  /** Slot ids the person attends, in `slots` order (DEC-074). Null is "모름", and always null without `slots`. */
  slotIds: string[] | null;
  operation: ApplicationOperation;
  /** Counts edits from 1; above 1 the table marks "수정됨" and `submittedAt` is the last edit (#437). */
  revision: number;
  /** Who stored the current revision; null for revision 1 or from an older server. */
  revisedBy: "PARTICIPANT" | "OPERATOR" | null;
  /** Room of the latest room publication (G5 #460, DEC-085 §10). Null before it or when unassigned. */
  room: TableRoom | null;
  /** Lodging state now, so a blank room can read as 숙박 안 함; null from an older server. */
  lodging: Lodging | null;
  /** The 현장 운영 roster's arrival standing (DEC-091 Follow-up 3); null without slots or from an older server. */
  arrival: RosterArrival | null;
};

/** One meal or service slot, the same shape as the group board's `slots`. */
export type TableSlot = {
  slotId: string;
  day: number;
  date: string;
  /** Example: `1월 22일 (금)`. */
  dayLabel: string;
  meal: string;
  label: string;
  sortOrder: number;
};

/**
 * A withdrawn applicant (DEC-084 §9). Kept apart from `rows`, so no count of the table includes
 * them. `previousGroup` is the group the withdraw removed (a reference; restoring does not bring it
 * back), null when the group is gone or the reader cannot see groups.
 */
export type WithdrawnApplicant = {
  applicationId: string;
  participantId: string;
  name: string;
  submittedAt: string;
  withdrawal: ApplicationWithdrawal;
  previousGroup: { groupId: string; name: string } | null;
  checkedInAt: string | null;
};

export type ApplicationTable = {
  formId: string | null;
  contactVisible: boolean;
  groupVisible: boolean;
  columns: TableColumn[];
  rows: TableRow[];
  /** Null when the form has no setup or no slot. */
  slots: TableSlot[] | null;
  /** Newest withdraw first. Empty from an older server. */
  withdrawn: WithdrawnApplicant[];
  /** Latest room publication time; null before the first one (every `room` is then null). */
  roomPublishedAt: string | null;
};

/**
 * 참가 현황 table (#308): every SUBMITTED applicant with every answer the reader may see, in one
 * response, plus the withdrawn applicants apart (DEC-084). The screen filters, sorts and counts. Phone columns come only with
 * `PARTICIPANT_CONTACT_READ`; groups only with `GROUP_WRITE` or a space OWNER/ADMIN.
 */
export function getApplicationTable(eventId: string, signal?: AbortSignal): Promise<ApplicationTable> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/applications/table`, { signal }).then(parseTable);
}

/**
 * Saves the operation memo (#335, DEC-075). Needs effective PARTICIPANT_WRITE; a stale
 * `expectedVersion` is `409 CONCURRENT_MODIFICATION` with the current `version`. The original
 * answers never change.
 */
export function saveApplicationOperation(
  eventId: string,
  applicationId: string,
  input: { memo: string; expectedVersion: number },
): Promise<ApplicationOperation> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/applications/${applicationId}/operation`, {
    method: "PUT",
    body: input,
  }).then((value) => {
    const operation = parseOperation(value);
    if (!operation) throw new ApiError({ status: 200, code: "UNEXPECTED" });
    return operation;
  });
}

export type OperatorRevised = { applicationId: string; participantId: string; revision: number; revised: boolean };

/**
 * 운영자 신청 고치기 (DEC-088 §2). Needs effective PARTICIPANT_WRITE. Works after applications and
 * edits close; only the name and phone are required; consent and hidden answers stay as they were.
 * A stale revision is `409 CONCURRENT_MODIFICATION` with the current `applicationId`·`revision`.
 */
export function reviseApplicationAnswers(
  eventId: string,
  applicationId: string,
  input: { expectedRevision: number; answers: AnswerItem[] },
): Promise<OperatorRevised> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/applications/${applicationId}/answers`, {
    method: "PUT",
    body: input,
  }).then((value) => {
    if (
      !isRecord(value) ||
      typeof value.applicationId !== "string" ||
      typeof value.participantId !== "string" ||
      typeof value.revision !== "number"
    ) {
      throw new ApiError({ status: 200, code: "UNEXPECTED" });
    }
    return { applicationId: value.applicationId, participantId: value.participantId, revision: value.revision, revised: value.revised === true };
  });
}

export type ParticipantAdded = { applicationId: string; participantId: string; temporaryPin: string };

/**
 * 참가자 직접 추가 (DEC-088 §3). The temporary number is in this answer only. A phone that already
 * has a participant is `409 APPLICATION_ALREADY_EXISTS` with that person's `applicationId`·`status`.
 */
export function addParticipant(eventId: string, input: { formId: string; answers: AnswerItem[] }): Promise<ParticipantAdded> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/applications`, { method: "POST", body: input }).then((value) => {
    if (
      !isRecord(value) ||
      typeof value.applicationId !== "string" ||
      typeof value.participantId !== "string" ||
      typeof value.temporaryPin !== "string"
    ) {
      throw new ApiError({ status: 200, code: "UNEXPECTED" });
    }
    return { applicationId: value.applicationId, participantId: value.participantId, temporaryPin: value.temporaryPin };
  });
}

export type WithdrawResult = {
  result: "WITHDRAWN" | "ALREADY_WITHDRAWN";
  withdrawal: ApplicationWithdrawal;
  removedGroup: { groupId: string; name: string; leader: boolean } | null;
};

/**
 * 신청 취소 (DEC-084). Needs effective PARTICIPANT_WRITE; DRAFT and ACTIVE only. In one
 * transaction the server removes the working-copy group, ends the participant's sessions and keeps
 * the check-in record. A participant edit in between is `409 CONCURRENT_MODIFICATION`.
 */
export function withdrawApplication(
  eventId: string,
  applicationId: string,
  input: { reason: string; blockReapply: boolean },
): Promise<WithdrawResult> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/applications/${applicationId}/withdraw`, {
    method: "POST",
    body: { reason: input.reason.trim() || null, blockReapply: input.blockReapply },
  }).then((value) => {
    if (!isRecord(value) || (value.result !== "WITHDRAWN" && value.result !== "ALREADY_WITHDRAWN")) {
      throw new ApiError({ status: 200, code: "UNEXPECTED" });
    }
    const removed = value.removedGroup;
    return {
      result: value.result,
      withdrawal: parseWithdrawal(value.withdrawal) ?? EMPTY_WITHDRAWAL,
      removedGroup:
        isRecord(removed) && typeof removed.groupId === "string" && typeof removed.name === "string"
          ? { groupId: removed.groupId, name: removed.name, leader: removed.leader === true }
          : null,
    };
  });
}

export type RestoreResult = {
  result: "RESTORED" | "ALREADY_SUBMITTED";
  previousGroup: { groupId: string; name: string } | null;
  reapplyBlocked: boolean;
};

/** 되돌리기 (DEC-084 §3). The group does not come back; `previousGroup` is a reference. */
export function restoreApplication(eventId: string, applicationId: string): Promise<RestoreResult> {
  return apiRequest<unknown>(`/api/v1/operator/events/${eventId}/applications/${applicationId}/restore`, {
    method: "POST",
  }).then((value) => {
    if (!isRecord(value) || (value.result !== "RESTORED" && value.result !== "ALREADY_SUBMITTED")) {
      throw new ApiError({ status: 200, code: "UNEXPECTED" });
    }
    return {
      result: value.result,
      previousGroup: parseGroupRef(value.previousGroup),
      reapplyBlocked: value.reapplyBlocked === true,
    };
  });
}

const EMPTY_WITHDRAWAL: ApplicationWithdrawal = { withdrawnAt: null, withdrawnByDisplayName: null, reason: null, reapplyBlocked: false };

function parseWithdrawal(value: unknown): ApplicationWithdrawal | null {
  if (!isRecord(value)) return null;
  return {
    withdrawnAt: typeof value.withdrawnAt === "string" ? value.withdrawnAt : null,
    withdrawnByDisplayName: typeof value.withdrawnByDisplayName === "string" ? value.withdrawnByDisplayName : null,
    reason: typeof value.reason === "string" ? value.reason : null,
    reapplyBlocked: value.reapplyBlocked === true,
  };
}

function parseGroupRef(value: unknown): { groupId: string; name: string } | null {
  return isRecord(value) && typeof value.groupId === "string" && typeof value.name === "string"
    ? { groupId: value.groupId, name: value.name }
    : null;
}

function parseWithdrawn(value: unknown): WithdrawnApplicant[] {
  if (!Array.isArray(value)) return [];
  const out: WithdrawnApplicant[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.applicationId !== "string" || typeof item.participantId !== "string") continue;
    out.push({
      applicationId: item.applicationId,
      participantId: item.participantId,
      name: typeof item.name === "string" ? item.name : "",
      submittedAt: typeof item.submittedAt === "string" ? item.submittedAt : "",
      withdrawal: parseWithdrawal(item.withdrawal) ?? EMPTY_WITHDRAWAL,
      previousGroup: parseGroupRef(item.previousGroup),
      checkedInAt: typeof item.checkedInAt === "string" ? item.checkedInAt : null,
    });
  }
  return out;
}

/** Null when the value is not an operation; an older server without it reads as nothing saved. */
function parseOperation(value: unknown): ApplicationOperation | null {
  if (
    !isRecord(value) ||
    typeof value.memo !== "string" ||
    typeof value.version !== "number" ||
    !Number.isInteger(value.version) ||
    value.version < 0
  ) {
    return null;
  }
  return {
    memo: value.memo,
    version: value.version,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
    updatedByDisplayName: typeof value.updatedByDisplayName === "string" ? value.updatedByDisplayName : null,
  };
}

export function getPublicForm(eventId: string, formId: string, signal?: AbortSignal): Promise<PublicForm> {
  return apiRequest<unknown>(`/api/v1/public/events/${eventId}/forms/${formId}`, { signal }).then(parseForm);
}

export function submitApplication(
  eventId: string,
  formId: string,
  answers: AnswerItem[],
  pin: string,
): Promise<SubmittedApplication> {
  return apiRequest<unknown>(`/api/v1/public/events/${eventId}/forms/${formId}/applications`, {
    method: "POST",
    body: { pin, answers },
  }).then(parseSubmitted);
}

function parseForm(value: unknown): PublicForm {
  if (!isRecord(value) || typeof value.formId !== "string" || !Array.isArray(value.fields)) {
    throw new ApiError({ status: 200, code: "UNEXPECTED" });
  }
  return { formId: value.formId, fields: parseFormFields(value.fields) };
}

/** Public form fields, also used by the participant's own application (#427). */
export function parseFormFields(value: unknown[]): FormField[] {
  const fields: FormField[] = [];
  for (const field of value) {
    if (!isField(field)) throw new ApiError({ status: 200, code: "UNEXPECTED" });
    fields.push(withDefaults(field));
  }
  return fields;
}

function parseSubmitted(value: unknown): SubmittedApplication {
  if (
    !isRecord(value) ||
    typeof value.applicationId !== "string" ||
    typeof value.participantId !== "string" ||
    typeof value.revision !== "number" ||
    typeof value.revised !== "boolean"
  ) {
    throw new ApiError({ status: 201, code: "UNEXPECTED" });
  }
  return {
    applicationId: value.applicationId,
    participantId: value.participantId,
    revision: value.revision,
    revised: value.revised,
    completionNotice: typeof value.completionNotice === "string" ? value.completionNotice : null,
    restored: value.restored === true,
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
    if (!isField(answer)) throw new ApiError({ status: 200, code: "UNEXPECTED" });
    const contact = answer.contact === true;
    const withheld = contact && answer.value === null;
    if (!withheld && !isRecord(answer.value)) throw new ApiError({ status: 200, code: "UNEXPECTED" });
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
      value: isRecord(answer.value) ? answer.value : {},
      contact,
      withheld,
    });
  }
  return {
    applicationId: value.applicationId,
    formId: value.formId,
    status: value.status,
    submittedAt: value.submittedAt,
    // An older server sends every phone answer.
    contactVisible: value.contactVisible !== false,
    answers,
    operation: parseOperation(value.operation) ?? EMPTY_OPERATION,
    withdrawal: parseWithdrawal(value.withdrawal),
    revision: typeof value.revision === "number" ? value.revision : 1,
  };
}

function parseTable(value: unknown): ApplicationTable {
  if (
    !isRecord(value) ||
    !(value.formId === null || typeof value.formId === "string") ||
    !Array.isArray(value.columns) ||
    !Array.isArray(value.rows)
  ) {
    throw new ApiError({ status: 200, code: "UNEXPECTED" });
  }
  const columns: TableColumn[] = [];
  for (const column of value.columns) {
    if (!isField(column) || typeof column.answerType !== "string") throw new ApiError({ status: 200, code: "UNEXPECTED" });
    columns.push({
      fieldId: column.fieldId,
      kind: column.kind,
      systemKey: column.systemKey,
      presetKey: typeof column.presetKey === "string" ? column.presetKey : null,
      label: column.label,
      position: column.position,
      answerType: column.answerType as AnswerType,
      hidden: column.hidden === true,
      config: isRecord(column.config) ? (column.config as FieldConfig) : {},
      contact: column.contact === true,
    });
  }
  const rows: TableRow[] = [];
  for (const row of value.rows) {
    if (
      !isRecord(row) ||
      typeof row.applicationId !== "string" ||
      typeof row.submittedAt !== "string" ||
      !isRecord(row.answers)
    ) {
      throw new ApiError({ status: 200, code: "UNEXPECTED" });
    }
    const answers: Record<string, Record<string, unknown>> = {};
    for (const [fieldId, answer] of Object.entries(row.answers)) {
      if (isRecord(answer)) answers[fieldId] = answer;
    }
    const group = row.group;
    rows.push({
      applicationId: row.applicationId,
      participantId: typeof row.participantId === "string" ? row.participantId : "",
      submittedAt: row.submittedAt,
      answers,
      group:
        isRecord(group) && typeof group.groupId === "string" && typeof group.name === "string"
          ? { groupId: group.groupId, name: group.name, leader: group.leader === true }
          : null,
      checkedInAt: typeof row.checkedInAt === "string" ? row.checkedInAt : null,
      slotIds: Array.isArray(row.slotIds) ? row.slotIds.filter((id): id is string => typeof id === "string") : null,
      operation: parseOperation(row.operation) ?? EMPTY_OPERATION,
      revision: typeof row.revision === "number" ? row.revision : 1,
      revisedBy: row.revisedBy === "PARTICIPANT" || row.revisedBy === "OPERATOR" ? row.revisedBy : null,
      room: parseTableRoom(row.room),
      lodging: parseLodging(row.lodging),
      arrival: row.arrival === null || row.arrival === undefined ? null : parseRosterArrival(row.arrival),
    });
  }
  return {
    formId: value.formId,
    contactVisible: value.contactVisible === true,
    groupVisible: value.groupVisible === true,
    columns,
    rows,
    slots: parseSlots(value.slots),
    withdrawn: parseWithdrawn(value.withdrawn),
    roomPublishedAt: typeof value.roomPublishedAt === "string" ? value.roomPublishedAt : null,
  };
}

function parseSlots(value: unknown): TableSlot[] | null {
  if (!Array.isArray(value)) return null;
  const slots: TableSlot[] = [];
  for (const slot of value) {
    if (!isRecord(slot) || typeof slot.slotId !== "string" || typeof slot.label !== "string") continue;
    slots.push({
      slotId: slot.slotId,
      day: typeof slot.day === "number" ? slot.day : 0,
      date: typeof slot.date === "string" ? slot.date : "",
      dayLabel: typeof slot.dayLabel === "string" ? slot.dayLabel : "",
      meal: typeof slot.meal === "string" ? slot.meal : "",
      label: slot.label,
      sortOrder: typeof slot.sortOrder === "number" ? slot.sortOrder : 0,
    });
  }
  return slots.length > 0 ? slots : null;
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
