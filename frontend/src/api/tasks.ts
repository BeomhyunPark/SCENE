import { apiRequest } from "./client";
import type { ItemPage } from "./types";

export type TaskStatus = "TODO" | "DOING" | "DONE" | "CANCELLED";

export type BlockedReason =
  | "FORBIDDEN"
  | "EVENT_ARCHIVED"
  | "TASK_CANCELLED"
  | "TASK_DONE"
  | "CHECKLIST_INCOMPLETE"
  | null;

export type TaskOutcome =
  | "UPDATED"
  | "NO_CHANGE"
  | "COMPLETED"
  | "ALREADY_DONE"
  | "REOPENED"
  | "ALREADY_OPEN"
  | null;

export type ChecklistItem = {
  itemId: string;
  label: string;
  position: number;
  checked: boolean;
  checkedByUserId: string | null;
  checkedByDisplayName: string | null;
  checkedAt: string | null;
};

export type TaskActions = {
  canCheck: boolean;
  canComplete: boolean;
  canReopen: boolean;
  blockedReason: BlockedReason;
};

export type TaskProgress = {
  taskId: string;
  status: TaskStatus;
  version: number;
  checklist: { done: number; total: number; items: ChecklistItem[] };
  assigneeUserId: string | null;
  assigneeDisplayName: string | null;
  completedByUserId: string | null;
  completedByDisplayName: string | null;
  completedAt: string | null;
  actions: TaskActions;
  outcome: TaskOutcome;
};

export type TaskDetail = TaskProgress & { title: string };

export type TaskListItem = {
  taskId: string;
  title: string;
  status: TaskStatus;
  assigneeUserId: string | null;
  assigneeDisplayName: string | null;
  checklist: { done: number; total: number };
  version: number;
};

export function listTasks(
  eventId: string,
  query: { page: number; size: number },
): Promise<ItemPage<TaskListItem>> {
  return apiRequest(`/api/v1/operator/events/${eventId}/tasks`, {
    query: { page: query.page, size: query.size },
  });
}

export function createTask(
  eventId: string,
  input: { title: string; assigneeUserId?: string | null },
): Promise<TaskDetail> {
  const body: { title: string; assigneeUserId?: string | null } = { title: input.title };
  if (input.assigneeUserId !== undefined) body.assigneeUserId = input.assigneeUserId;
  return apiRequest(`/api/v1/operator/events/${eventId}/tasks`, { method: "POST", body });
}

export function getTask(eventId: string, taskId: string): Promise<TaskDetail> {
  return apiRequest(`/api/v1/operator/events/${eventId}/tasks/${taskId}`);
}

export function patchTask(
  eventId: string,
  taskId: string,
  input: { title?: string; assigneeUserId?: string | null; status?: "CANCELLED" },
): Promise<TaskDetail> {
  return apiRequest(`/api/v1/operator/events/${eventId}/tasks/${taskId}`, {
    method: "PATCH",
    body: input,
  });
}

export function deleteTask(eventId: string, taskId: string): Promise<void> {
  return apiRequest(`/api/v1/operator/events/${eventId}/tasks/${taskId}`, { method: "DELETE" });
}

export function setItemChecked(
  eventId: string,
  taskId: string,
  itemId: string,
  checked: boolean,
): Promise<TaskProgress> {
  return apiRequest(`/api/v1/operator/events/${eventId}/tasks/${taskId}/items/${itemId}`, {
    method: "PUT",
    body: { checked },
  });
}

export function completeTask(eventId: string, taskId: string, version: number): Promise<TaskProgress> {
  return apiRequest(`/api/v1/operator/events/${eventId}/tasks/${taskId}/complete`, {
    method: "POST",
    body: { version },
  });
}

export function reopenTask(
  eventId: string,
  taskId: string,
  input: { version: number; reason?: string },
): Promise<TaskProgress> {
  const body: { version: number; reason?: string } = { version: input.version };
  if (input.reason) body.reason = input.reason;
  return apiRequest(`/api/v1/operator/events/${eventId}/tasks/${taskId}/reopen`, {
    method: "POST",
    body,
  });
}
