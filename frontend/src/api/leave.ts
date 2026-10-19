import { listEvents } from "./events";
import { apiRequest } from "./client";
import { ApiError } from "./errors";

export type LeaveEvent = {
  eventId: string;
  isOwner: boolean;
  handoverAccepted: boolean;
  openTasks: number;
};

export type LeavePreview = {
  leaveBlocked: boolean;
  blockReason: string | null;
  events: LeaveEvent[];
};

const NAME_PAGE_SIZE = 100;

export function previewLeave(spaceId: string, signal?: AbortSignal): Promise<LeavePreview> {
  return apiRequest<unknown>(`/api/v1/operator/spaces/${spaceId}/me/leave-preview`, { signal }).then(
    parsePreview,
  );
}

export function leaveSpace(spaceId: string, keepEventIds: string[]): Promise<void> {
  return apiRequest(`/api/v1/operator/spaces/${spaceId}/me/leave`, {
    method: "POST",
    body: { keepEventIds },
  });
}

/** Names for the leave rows. The preview itself has no name, date, or status. */
export async function listEventNames(
  spaceId: string,
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  let page = 0;
  let totalPages = 1;
  while (page < totalPages) {
    const result = await listEvents(spaceId, { page, size: NAME_PAGE_SIZE }, signal);
    for (const item of result.items) {
      names[item.eventId] = item.name;
    }
    totalPages = result.page.totalPages;
    if (!Number.isFinite(totalPages) || totalPages < 1) {
      break;
    }
    page += 1;
  }
  return names;
}

function parsePreview(value: unknown): LeavePreview {
  if (!isRecord(value) || typeof value.leaveBlocked !== "boolean" || !Array.isArray(value.events)) {
    throw new ApiError({ status: 200, code: "UNEXPECTED" });
  }
  if (value.blockReason !== null && typeof value.blockReason !== "string") {
    throw new ApiError({ status: 200, code: "UNEXPECTED" });
  }
  return {
    leaveBlocked: value.leaveBlocked,
    blockReason: value.blockReason,
    events: value.events.map(parseEvent),
  };
}

function parseEvent(value: unknown): LeaveEvent {
  if (
    !isRecord(value) ||
    typeof value.eventId !== "string" ||
    value.eventId.length === 0 ||
    typeof value.isOwner !== "boolean" ||
    typeof value.handoverAccepted !== "boolean" ||
    typeof value.openTasks !== "number" ||
    !Number.isFinite(value.openTasks)
  ) {
    throw new ApiError({ status: 200, code: "UNEXPECTED" });
  }
  return {
    eventId: value.eventId,
    isOwner: value.isOwner,
    handoverAccepted: value.handoverAccepted,
    openTasks: value.openTasks,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
