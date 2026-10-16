import type { ChecklistItem, TaskActions, TaskDetail, TaskListItem, TaskOutcome, TaskProgress, TaskStatus } from "../api/tasks";
import { eventById } from "./operatorStore";
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

export function resetTaskStore(): void {
  operators = seedOperators();
  tasks = [seedChecklistTask()];
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
  const effective = defaultsFor(row.role);
  return {
    userId,
    role: row.role,
    roleDefaults: effective,
    overrides: { grants: [], revokes: [] },
    effective,
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
  if (!row || !defaultsFor(row.role).includes("TASK_WRITE")) return { status: 403, code: "FORBIDDEN" };
  return null;
}

function requireProgress(eventId: string, actorId: string, task: TaskRow): TaskFailure | null {
  const row = operators.find((operator) => operator.eventId === eventId && operator.userId === actorId);
  const can = Boolean(row && (defaultsFor(row.role).includes("TASK_WRITE") || task.assigneeUserId === actorId));
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

function defaultsFor(role: Role): string[] {
  if (role === "OWNER") return ["EVENT_READ", "TASK_WRITE"];
  if (role === "MANAGER") return ["EVENT_READ", "TASK_WRITE"];
  return ["EVENT_READ"];
}

function countsOf(task: TaskRow): { done: number; total: number } {
  return { done: task.items.filter((item) => item.checked).length, total: task.items.length };
}

function actionsFor(task: TaskRow, actorId: string): TaskActions {
  const event = eventById(task.eventId);
  const row = operators.find((operator) => operator.eventId === task.eventId && operator.userId === actorId);
  const canWrite = Boolean(row && (defaultsFor(row.role).includes("TASK_WRITE") || task.assigneeUserId === actorId));
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
