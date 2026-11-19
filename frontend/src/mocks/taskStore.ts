import type { ChecklistItem, TaskActions, TaskDetail, TaskListItem, TaskOutcome, TaskProgress, TaskStatus } from "../api/tasks";
import { eventById, isMemberOf } from "./operatorStore";
import { localEvent, localUsers } from "./fixtures/seed";

type Role = "OWNER" | "MANAGER" | "STAFF";

type OperatorRow = { eventId: string; userId: string; displayName: string; role: Role };

type ItemRow = {
  itemId: string;
  label: string;
  position: number;
  checked: boolean;
  checkedByUserId: string | null;
  checkedByDisplayName: string | null;
  checkedAt: string | null;
};

type TaskRow = {
  eventId: string;
  taskId: string;
  title: string;
  status: TaskStatus;
  version: number;
  assigneeUserId: string | null;
  completedByUserId: string | null;
  completedByDisplayName: string | null;
  completedAt: string | null;
  items: ItemRow[];
};

export type TaskFailure = {
  status: number;
  code: string;
  errors?: { field: string }[];
  reason?: string;
  task?: TaskProgress;
  eventStatus?: string;
};

const ROLES: Record<string, Role> = {
  [localUsers[0].userId]: "OWNER",
  [localUsers[1].userId]: "MANAGER",
  [localUsers[2].userId]: "STAFF",
};

let operators: OperatorRow[] = seedOperators();
let tasks: TaskRow[] = [seedChecklistTask()];
/** Per-operator overrides, keyed `eventId|userId`, as the event OWNER stored them (DEC-029, DEC-079). */
type Overrides = { grants: string[]; revokes: string[] };
let overrides = new Map<string, Overrides>();

/** Keys the server registers (Permission enum). Anything else is UNKNOWN_PERMISSION. */
const KNOWN_KEYS = [
  "EVENT_UPDATE", "EVENT_USER_READ", "PARTICIPANT_READ", "PARTICIPANT_CONTACT_READ", "PARTICIPANT_WRITE",
  "FORM_WRITE", "APPLICATION_READ", "APPLICATION_MANAGE", "TASK_WRITE", "SCHEDULE_WRITE", "NOTICE_WRITE",
  "FINANCE_READ", "FINANCE_WRITE", "GROUP_WRITE", "ROOM_WRITE", "RIDE_WRITE", "CLASS_WRITE", "CHECKIN_WRITE",
  "MISSION_WRITE", "GUARDIAN_WRITE", "GUARDIAN_CONTACT_READ", "PRIVACY_LOG_READ", "AUDIT_LOG_READ",
  "DATA_EXPORT", "EVENT_READ", "EVENT_LIFECYCLE", "EVENT_USER_MANAGE",
];
const OWNER_ONLY = ["EVENT_LIFECYCLE", "EVENT_USER_MANAGE"];

export function resetTaskStore(): void {
  operators = seedOperators();
  tasks = [seedChecklistTask()];
  overrides = new Map();
}

/** Test seam: removes default keys from one operator's effective permissions. */
export function revokePermissions(eventId: string, userId: string, keys: string[]): void {
  const current = overrides.get(`${eventId}|${userId}`) ?? { grants: [], revokes: [] };
  overrides.set(`${eventId}|${userId}`, { grants: current.grants, revokes: keys });
}

/** Test seam: adds personal GRANTs to one operator. */
export function grantPermissions(eventId: string, userId: string, keys: string[]): void {
  const current = overrides.get(`${eventId}|${userId}`) ?? { grants: [], revokes: [] };
  overrides.set(`${eventId}|${userId}`, { grants: keys, revokes: current.revokes });
}

/**
 * PUT …/operators/{userId}/permissions in OperatorPermissionService#replace order: FORBIDDEN (not
 * the event OWNER), not an operator (404), body (400, UNKNOWN_PERMISSION / DUPLICATE_PERMISSION),
 * archived widening (409), then the 422 rules. A GRANT of a default key and a REVOKE of a key the
 * role does not have are dropped, like the server's normalize.
 */
export function replacePermissions(
  eventId: string,
  actorId: string,
  userId: string,
  body: unknown,
): ReturnType<typeof permissionsFor> {
  const gate = open(eventId, actorId);
  if (gate) return gate;
  const actor = operators.find((row) => row.eventId === eventId && row.userId === actorId);
  if (actor?.role !== "OWNER") return { status: 403, code: "FORBIDDEN" };
  const target = operators.find((row) => row.eventId === eventId && row.userId === userId);
  if (!target) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const input = body as { grants?: unknown; revokes?: unknown } | null;
  const grants = input?.grants;
  const revokeKeys = input?.revokes;
  if (!Array.isArray(grants)) return { status: 400, code: "VALIDATION_FAILED", errors: [{ field: "grants" }] };
  if (!Array.isArray(revokeKeys)) return { status: 400, code: "VALIDATION_FAILED", errors: [{ field: "revokes" }] };
  const all = [...grants, ...revokeKeys];
  if (all.some((key) => typeof key !== "string" || !KNOWN_KEYS.includes(key))) {
    return { status: 400, code: "VALIDATION_FAILED", errors: [{ field: "grants" }] };
  }
  if (new Set(all).size !== all.length) return { status: 400, code: "VALIDATION_FAILED", errors: [{ field: "grants" }] };
  const stored = overrides.get(`${eventId}|${userId}`) ?? { grants: [], revokes: [] };
  const widens =
    (grants as string[]).some((key) => !stored.grants.includes(key)) ||
    stored.revokes.some((key) => !(revokeKeys as string[]).includes(key));
  if (eventById(eventId)?.lifecycleStatus === "ARCHIVED" && widens) return { status: 409, code: "EVENT_ARCHIVED" };
  if (target.role === "OWNER") return { status: 422, code: "PERMISSION_OWNER_NOT_OVERRIDABLE" };
  if ((grants as string[]).some((key) => OWNER_ONLY.includes(key))) return { status: 422, code: "PERMISSION_OWNER_ONLY" };
  if ((revokeKeys as string[]).includes("EVENT_READ")) return { status: 422, code: "PERMISSION_NOT_OVERRIDABLE" };
  const defaults = defaultsFor(target.role);
  overrides.set(`${eventId}|${userId}`, {
    grants: (grants as string[]).filter((key) => !defaults.includes(key)).sort(),
    revokes: (revokeKeys as string[]).filter((key) => defaults.includes(key)).sort(),
  });
  return permissionsFor(eventId, actorId, userId);
}

export function tasksFor(eventId: string, actorId: string): TaskListItem[] | TaskFailure {
  const gate = open(eventId, actorId);
  if (gate) return gate;
  return tasks
    .filter((task) => task.eventId === eventId)
    .sort((left, right) => left.taskId.localeCompare(right.taskId))
    .map((task) => toListItem(task));
}

export function taskDetail(eventId: string, taskId: string, actorId: string): TaskDetail | TaskFailure {
  const missing = missingTask(eventId, taskId);
  if (missing) return missing;
  const gate = open(eventId, actorId);
  if (gate) return gate;
  return toDetail(taskRow(eventId, taskId)!, actorId, null);
}

export function createTask(
  eventId: string,
  actorId: string,
  body: Record<string, unknown>,
): TaskDetail | TaskFailure {
  const gate = open(eventId, actorId);
  if (gate) return gate;
  const write = requireWrite(eventId, actorId);
  if (write) return write;
  const archived = archivedFailure(eventId, actorId, null);
  if (archived) return archived;
  if (typeof body.title !== "string") return field("title");
  const title = body.title.trim();
  if (title.length < 1 || title.length > 200) return field("title");
  let assignee: string | null = null;
  if ("assigneeUserId" in body && body.assigneeUserId !== null) {
    if (typeof body.assigneeUserId !== "string" || !operatorOn(eventId, body.assigneeUserId)) {
      return field("assigneeUserId");
    }
    assignee = body.assigneeUserId;
  }
  const task: TaskRow = {
    eventId,
    taskId: crypto.randomUUID(),
    title,
    status: "TODO",
    version: 0,
    assigneeUserId: assignee,
    completedByUserId: null,
    completedByDisplayName: null,
    completedAt: null,
    items: [],
  };
  tasks.push(task);
  return toDetail(task, actorId, null);
}

export function patchTask(
  eventId: string,
  taskId: string,
  actorId: string,
  body: Record<string, unknown>,
): TaskDetail | TaskFailure {
  const missing = missingTask(eventId, taskId);
  if (missing) return missing;
  const gate = open(eventId, actorId);
  if (gate) return gate;
  const write = requireWrite(eventId, actorId);
  if (write) return write;
  const task = taskRow(eventId, taskId)!;
  const archived = archivedFailure(eventId, actorId, task);
  if (archived) return archived;
  if ("title" in body) {
    if (typeof body.title !== "string") return field("title");
    const title = body.title.trim();
    if (title.length < 1 || title.length > 200) return field("title");
    task.title = title;
  }
  if ("assigneeUserId" in body) {
    if (body.assigneeUserId === null) {
      task.assigneeUserId = null;
      task.version += 1;
    } else if (typeof body.assigneeUserId === "string" && operatorOn(eventId, body.assigneeUserId)) {
      task.assigneeUserId = body.assigneeUserId;
      task.version += 1;
    } else {
      return field("assigneeUserId");
    }
  }
  if ("status" in body) {
    if (body.status !== "CANCELLED") return field("status");
    if (task.status !== "CANCELLED") {
      task.status = "CANCELLED";
      task.version += 1;
    }
  }
  return toDetail(task, actorId, null);
}

export function removeTask(eventId: string, taskId: string, actorId: string): null | TaskFailure {
  const missing = missingTask(eventId, taskId);
  if (missing) return missing;
  const gate = open(eventId, actorId);
  if (gate) return gate;
  const write = requireWrite(eventId, actorId);
  if (write) return write;
  const task = taskRow(eventId, taskId)!;
  const archived = archivedFailure(eventId, actorId, task);
  if (archived) return archived;
  tasks = tasks.filter((row) => row.taskId !== taskId);
  return null;
}

export function setChecked(
  eventId: string,
  taskId: string,
  itemId: string,
  actorId: string,
  checked: boolean,
): TaskProgress | TaskFailure {
  const missing = missingTask(eventId, taskId);
  if (missing) return missing;
  const task = taskRow(eventId, taskId)!;
  const item = task.items.find((row) => row.itemId === itemId);
  if (!item) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const gate = open(eventId, actorId);
  if (gate) return gate;
  const progress = requireProgress(eventId, actorId, task);
  if (progress) return progress;
  const archived = archivedFailure(eventId, actorId, task);
  if (archived) return archived;
  if (task.status === "DONE") return invalid(actorId, task, "TASK_DONE");
  if (task.status === "CANCELLED") return invalid(actorId, task, "TASK_CANCELLED");
  if (item.checked === checked) return toProgress(task, actorId, "NO_CHANGE");
  item.checked = checked;
  const actor = operators.find((row) => row.eventId === eventId && row.userId === actorId);
  item.checkedByUserId = checked ? actorId : null;
  item.checkedByDisplayName = checked ? (actor?.displayName ?? null) : null;
  item.checkedAt = checked ? new Date().toISOString() : null;
  if (checked && task.status === "TODO") task.status = "DOING";
  task.version += 1;
  return toProgress(task, actorId, "UPDATED");
}

export function completeTask(
  eventId: string,
  taskId: string,
  actorId: string,
  version: number | null,
): TaskProgress | TaskFailure {
  return finish(eventId, taskId, actorId, version, null, "complete");
}

export function reopenTask(
  eventId: string,
  taskId: string,
  actorId: string,
  version: number | null,
  reason: string | null,
): TaskProgress | TaskFailure {
  return finish(eventId, taskId, actorId, version, reason, "reopen");
}

export function operatorsFor(eventId: string, actorId: string): OperatorRow[] | TaskFailure {
  const gate = open(eventId, actorId);
  if (gate) return gate;
  return operators.filter((row) => row.eventId === eventId);
}

/** Event role of one user, or null. Used by the invitation mock. */
export function eventRoleOf(eventId: string, userId: string): Role | null {
  return operators.find((row) => row.eventId === eventId && row.userId === userId)?.role ?? null;
}

/** Invitation accept: adds the user once. An existing operator keeps their role. */
/** Event rows of one person in every space (#387). */
export function eventsOperatedBy(userId: string): { eventId: string; role: Role }[] {
  return operators.filter((row) => row.userId === userId).map((row) => ({ eventId: row.eventId, role: row.role }));
}

export function addOperator(eventId: string, userId: string, displayName: string, role: Role): void {
  if (operators.some((row) => row.eventId === eventId && row.userId === userId)) return;
  operators.push({ eventId, userId, displayName, role });
}

/**
 * Direct add by the event OWNER, in OperatorPermissionService#add order: FORBIDDEN, role,
 * EVENT_ARCHIVED, already an operator (VALIDATION_FAILED userId), then not an active member
 * (RESOURCE_NOT_FOUND).
 */
export function addOperatorByOwner(eventId: string, actorId: string, body: unknown): OperatorRow | TaskFailure {
  const gate = open(eventId, actorId);
  if (gate) return gate;
  const actor = operators.find((row) => row.eventId === eventId && row.userId === actorId);
  if (actor?.role !== "OWNER") return { status: 403, code: "FORBIDDEN" };
  const input = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  if (typeof input.userId !== "string" || input.userId.length === 0) return field("userId");
  const role = input.role;
  if (role !== "OWNER" && role !== "MANAGER" && role !== "STAFF") return field("role");
  const event = eventById(eventId)!;
  if (event.lifecycleStatus === "ARCHIVED") return { status: 409, code: "EVENT_ARCHIVED" };
  if (operatorOn(eventId, input.userId)) return field("userId");
  if (!isMemberOf(event.spaceId, input.userId)) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const displayName = localUsers.find((user) => user.userId === input.userId)?.displayName ?? "";
  const row: OperatorRow = { eventId, userId: input.userId, displayName, role };
  operators.push(row);
  return row;
}

/**
 * Role change by the event OWNER (#371), in OperatorPermissionService#changeOperatorRole order:
 * FORBIDDEN, not an operator (RESOURCE_NOT_FOUND), role (MANAGER or STAFF only), then
 * EVENT_ARCHIVED. Even the same role clears the person's individual permission rows.
 */
export function changeRoleByOwner(
  eventId: string,
  actorId: string,
  userId: string,
  body: unknown,
): OperatorRow | TaskFailure {
  const gate = open(eventId, actorId);
  if (gate) return gate;
  const actor = operators.find((row) => row.eventId === eventId && row.userId === actorId);
  if (actor?.role !== "OWNER") return { status: 403, code: "FORBIDDEN" };
  const row = operators.find((operator) => operator.eventId === eventId && operator.userId === userId);
  if (!row) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const input = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const role = input.role;
  if (role !== "MANAGER" && role !== "STAFF") return field("role");
  if (eventById(eventId)?.lifecycleStatus === "ARCHIVED") return { status: 409, code: "EVENT_ARCHIVED" };
  overrides.delete(`${eventId}|${userId}`);
  row.role = role;
  return row;
}

/**
 * Removal by the event OWNER (#371), in OperatorPermissionService#remove order: FORBIDDEN, then not
 * an operator (RESOURCE_NOT_FOUND). Like the server, an archived event does not block it. Tasks the
 * person was assigned lose the assignee and bump their version; individual permissions go too.
 */
export function removeByOwner(eventId: string, actorId: string, userId: string): null | TaskFailure {
  const gate = open(eventId, actorId);
  if (gate) return gate;
  const actor = operators.find((row) => row.eventId === eventId && row.userId === actorId);
  if (actor?.role !== "OWNER") return { status: 403, code: "FORBIDDEN" };
  if (!operatorOn(eventId, userId)) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  for (const task of tasks) {
    if (task.eventId === eventId && task.assigneeUserId === userId) {
      task.assigneeUserId = null;
      task.version += 1;
    }
  }
  overrides.delete(`${eventId}|${userId}`);
  operators = operators.filter((row) => !(row.eventId === eventId && row.userId === userId));
  return null;
}

export function permissionsFor(
  eventId: string,
  actorId: string,
  userId: string,
): { userId: string; role: Role; roleDefaults: string[]; overrides: { grants: string[]; revokes: string[] }; effective: string[] } | TaskFailure {
  const gate = open(eventId, actorId);
  if (gate) return gate;
  const row = operators.find((operator) => operator.eventId === eventId && operator.userId === userId);
  if (!row) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  const actor = operators.find((operator) => operator.eventId === eventId && operator.userId === actorId);
  if (actorId !== userId && actor?.role === "STAFF") return { status: 403, code: "FORBIDDEN" };
  const roleDefaults = defaultsFor(row.role);
  const stored = overrides.get(`${eventId}|${userId}`) ?? { grants: [], revokes: [] };
  const granted = row.role === "OWNER" ? [] : stored.grants.filter((key) => !OWNER_ONLY.includes(key));
  return {
    userId,
    role: row.role,
    roleDefaults,
    overrides: { grants: [...stored.grants], revokes: [...stored.revokes] },
    effective: [...roleDefaults.filter((key) => !stored.revokes.includes(key)), ...granted].sort(),
  };
}

function finish(
  eventId: string,
  taskId: string,
  actorId: string,
  version: number | null,
  reason: string | null,
  kind: "complete" | "reopen",
): TaskProgress | TaskFailure {
  const missing = missingTask(eventId, taskId);
  if (missing) return missing;
  const task = taskRow(eventId, taskId)!;
  const gate = open(eventId, actorId);
  if (gate) return gate;
  const progress = requireProgress(eventId, actorId, task);
  if (progress) return progress;
  if (version === null) return field("version");
  if (reason !== null && reason.length > 500) return field("reason");
  const archived = archivedFailure(eventId, actorId, task);
  if (archived) return archived;
  if (kind === "complete" && task.status === "DONE") return toProgress(task, actorId, "ALREADY_DONE");
  if (kind === "reopen" && (task.status === "TODO" || task.status === "DOING")) {
    return toProgress(task, actorId, "ALREADY_OPEN");
  }
  if (task.version !== version) return conflict(actorId, task);
  if (task.status === "CANCELLED") return invalid(actorId, task, "TASK_CANCELLED");
  if (kind === "complete") {
    const counts = countsOf(task);
    if (counts.done !== counts.total) return invalid(actorId, task, "CHECKLIST_INCOMPLETE");
    const actor = operators.find((row) => row.eventId === eventId && row.userId === actorId);
    task.status = "DONE";
    task.version += 1;
    task.completedByUserId = actorId;
    task.completedByDisplayName = actor?.displayName ?? null;
    task.completedAt = new Date().toISOString();
    return toProgress(task, actorId, "COMPLETED");
  }
  task.status = "DOING";
  task.version += 1;
  task.completedByUserId = null;
  task.completedByDisplayName = null;
  task.completedAt = null;
  return toProgress(task, actorId, "REOPENED");
}

function open(eventId: string, actorId: string): TaskFailure | null {
  if (!eventById(eventId)) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  ensureCreator(eventId, actorId);
  if (!operators.some((row) => row.eventId === eventId && row.userId === actorId)) {
    return { status: 403, code: "NOT_A_MEMBER" };
  }
  return null;
}

function ensureCreator(eventId: string, actorId: string): void {
  if (operators.some((row) => row.eventId === eventId)) return;
  const known = ROLES[actorId];
  if (!known) return;
  const user = localUsers.find((row) => row.userId === actorId);
  if (!user) return;
  operators.push({ eventId, userId: actorId, displayName: user.displayName, role: "OWNER" });
}

function requireWrite(eventId: string, actorId: string): TaskFailure | null {
  const row = operators.find((operator) => operator.eventId === eventId && operator.userId === actorId);
  if (!row || !hasKey(row, "TASK_WRITE")) return { status: 403, code: "FORBIDDEN" };
  return null;
}

function requireProgress(eventId: string, actorId: string, task: TaskRow): TaskFailure | null {
  const row = operators.find((operator) => operator.eventId === eventId && operator.userId === actorId);
  const can = Boolean(row && (hasKey(row, "TASK_WRITE") || task.assigneeUserId === actorId));
  if (!can) return { status: 403, code: "FORBIDDEN" };
  return null;
}

function archivedFailure(eventId: string, actorId: string, task: TaskRow | null): TaskFailure | null {
  const event = eventById(eventId);
  if (event?.lifecycleStatus !== "ARCHIVED") return null;
  return {
    status: 409,
    code: "EVENT_ARCHIVED",
    eventStatus: event.lifecycleStatus,
    task: task ? toProgress(task, actorId, null) : undefined,
  };
}

function missingTask(eventId: string, taskId: string): TaskFailure | null {
  if (!eventById(eventId) || !taskRow(eventId, taskId)) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  return null;
}

function conflict(actorId: string, task: TaskRow): TaskFailure {
  return { status: 409, code: "TASK_VERSION_CONFLICT", task: toProgress(task, actorId, null) };
}

function invalid(actorId: string, task: TaskRow, reason: string): TaskFailure {
  return { status: 409, code: "INVALID_TASK_STATE", reason, task: toProgress(task, actorId, null) };
}

function field(name: string): TaskFailure {
  return { status: 400, code: "VALIDATION_FAILED", errors: [{ field: name }] };
}

function taskRow(eventId: string, taskId: string): TaskRow | undefined {
  return tasks.find((task) => task.eventId === eventId && task.taskId === taskId);
}

function operatorOn(eventId: string, userId: string): boolean {
  return operators.some((row) => row.eventId === eventId && row.userId === userId);
}

function hasKey(row: OperatorRow, key: string): boolean {
  const effective = permissionsFor(row.eventId, row.userId, row.userId);
  return "effective" in effective && effective.effective.includes(key);
}

function defaultsFor(role: Role): string[] {
  // The server gives an event OWNER every event key. The mock lists the keys these screens read.
  // DEC-071: OWNER, MANAGER and STAFF all check in by default. DEC-072: only OWNER has GROUP_WRITE.
  if (role === "OWNER") {
    return [
      "EVENT_READ",
      "EVENT_UPDATE",
      "TASK_WRITE",
      "FORM_WRITE",
      "CHECKIN_WRITE",
      "DATA_EXPORT",
      "PARTICIPANT_CONTACT_READ",
      "GROUP_WRITE",
      // DEC-075: operation memo writes; only OWNER by default, others by GRANT.
      "PARTICIPANT_WRITE",
    ];
  }
  // DEC-079: MANAGER also writes the schedule and notices by default.
  if (role === "MANAGER") return ["EVENT_READ", "TASK_WRITE", "CHECKIN_WRITE", "SCHEDULE_WRITE", "NOTICE_WRITE"];
  return ["EVENT_READ", "CHECKIN_WRITE"];
}

function countsOf(task: TaskRow): { done: number; total: number } {
  return { done: task.items.filter((item) => item.checked).length, total: task.items.length };
}

function actionsFor(task: TaskRow, actorId: string): TaskActions {
  const event = eventById(task.eventId);
  const row = operators.find((operator) => operator.eventId === task.eventId && operator.userId === actorId);
  const canWrite = Boolean(row && (hasKey(row, "TASK_WRITE") || task.assigneeUserId === actorId));
  const archived = event?.lifecycleStatus === "ARCHIVED";
  const cancelled = task.status === "CANCELLED";
  const done = task.status === "DONE";
  const counts = countsOf(task);
  const complete = counts.done === counts.total;
  let blockedReason: TaskActions["blockedReason"] = null;
  if (!canWrite) blockedReason = "FORBIDDEN";
  else if (archived) blockedReason = "EVENT_ARCHIVED";
  else if (cancelled) blockedReason = "TASK_CANCELLED";
  else if (done) blockedReason = "TASK_DONE";
  else if (!complete) blockedReason = "CHECKLIST_INCOMPLETE";
  return {
    canCheck: canWrite && !archived && !cancelled && !done,
    canComplete: canWrite && !archived && !cancelled && !done && complete,
    canReopen: canWrite && !archived && done,
    blockedReason,
  };
}

function display(eventId: string, userId: string | null): string | null {
  if (!userId) return null;
  return operators.find((row) => row.eventId === eventId && row.userId === userId)?.displayName ?? null;
}

function toItems(task: TaskRow): ChecklistItem[] {
  return task.items.map((item) => ({ ...item }));
}

function toProgress(task: TaskRow, actorId: string, outcome: TaskOutcome): TaskProgress {
  const counts = countsOf(task);
  return {
    taskId: task.taskId,
    status: task.status,
    version: task.version,
    checklist: { ...counts, items: toItems(task) },
    assigneeUserId: task.assigneeUserId,
    assigneeDisplayName: display(task.eventId, task.assigneeUserId),
    completedByUserId: task.completedByUserId,
    completedByDisplayName: task.completedByDisplayName,
    completedAt: task.completedAt,
    actions: actionsFor(task, actorId),
    outcome,
  };
}

function toDetail(task: TaskRow, actorId: string, outcome: TaskOutcome): TaskDetail {
  return { ...toProgress(task, actorId, outcome), title: task.title };
}

function toListItem(task: TaskRow): TaskListItem {
  const counts = countsOf(task);
  return {
    taskId: task.taskId,
    title: task.title,
    status: task.status,
    assigneeUserId: task.assigneeUserId,
    assigneeDisplayName: display(task.eventId, task.assigneeUserId),
    checklist: counts,
    version: task.version,
  };
}

function seedOperators(): OperatorRow[] {
  return [
    { eventId: localEvent.eventId, userId: localUsers[0].userId, displayName: localUsers[0].displayName, role: "OWNER" },
    { eventId: localEvent.eventId, userId: localUsers[1].userId, displayName: localUsers[1].displayName, role: "MANAGER" },
    { eventId: localEvent.eventId, userId: localUsers[2].userId, displayName: localUsers[2].displayName, role: "STAFF" },
  ];
}

function seedChecklistTask(): TaskRow {
  // The live server has no route that adds checklist rows. This fixture exists
  // only in the mock; a real event gets items only from a direct database insert.
  return {
    eventId: localEvent.eventId,
    taskId: "00000000-0000-4000-8000-000000000040",
    title: "안내문 출력",
    status: "TODO",
    version: 0,
    assigneeUserId: null,
    completedByUserId: null,
    completedByDisplayName: null,
    completedAt: null,
    items: [
      {
        itemId: "00000000-0000-4000-8000-000000000041",
        label: "출력",
        position: 0,
        checked: false,
        checkedByUserId: null,
        checkedByDisplayName: null,
        checkedAt: null,
      },
      {
        itemId: "00000000-0000-4000-8000-000000000042",
        label: "배포",
        position: 1,
        checked: true,
        checkedByUserId: localUsers[0].userId,
        checkedByDisplayName: localUsers[0].displayName,
        checkedAt: "2026-10-16T00:00:00Z",
      },
    ],
  };
}
