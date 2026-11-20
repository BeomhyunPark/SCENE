import { apiRequest } from "./client";
import { ApiError } from "./errors";

/**
 * `GET /participant/home` and `GET /participant/updates` (DEC-080, participant-home-contract §3·§4).
 * The screen decides tabs and cards from `features` and `updates` only, never from the event type.
 */
export type ParticipantFeatureKey = "schedule" | "notices" | "groups" | "rooms" | "mealOrder";
export type ParticipantFeatures = Record<ParticipantFeatureKey, boolean>;

export type ParticipantEventStatus = "DRAFT" | "ACTIVE" | "ENDED" | "ARCHIVED";

/**
 * Card versions. Values are only compared for difference (§4), never for size. A key the screen does
 * not know is dropped here, so a newer server cannot break an older screen.
 */
export const FEED_KEYS = [
  "home",
  "schedule",
  "notices",
  "group",
  "rooms",
  "mealOrder",
  "checkIn",
  "application",
] as const;
export type FeedKey = (typeof FEED_KEYS)[number];

export type ParticipantUpdates = {
  versions: Partial<Record<FeedKey, number>>;
  notifications: { latestSeq: number; unreadCount: number } | null;
  /** Server-chosen seconds to the next check, kept within 10–300 (§4). */
  pollAfterSeconds: number;
  /** For "지금·다음 일정" (§6): phone clock + (serverTime − phone time when received). */
  serverTime: string | null;
};

export type ParticipantHome = {
  event: {
    eventId: string;
    name: string;
    status: ParticipantEventStatus;
    startDate: string | null;
    endDate: string | null;
    place: string | null;
    timeZone: string;
  };
  participant: { name: string; applicationStatus: "SUBMITTED" | "NONE" };
  /** The form's completion notice now, plain text, or null. See `completionText`. */
  completionNotice: string | null;
  features: ParticipantFeatures;
  updates: ParticipantUpdates | null;
};

export const DEFAULT_POLL_SECONDS = 30;
const MIN_POLL_SECONDS = 10;
const MAX_POLL_SECONDS = 300;

export function getParticipantHome(signal?: AbortSignal): Promise<ParticipantHome> {
  return apiRequest<unknown>("/api/v1/participant/home", { signal }).then(parseHome);
}

export function getParticipantUpdates(signal?: AbortSignal): Promise<ParticipantUpdates> {
  return apiRequest<unknown>("/api/v1/participant/updates", { signal }).then((value) => {
    const updates = parseUpdates(value);
    if (!updates) throw unexpected();
    return updates;
  });
}

export function parseHome(value: unknown): ParticipantHome {
  if (!isRecord(value) || !isRecord(value.event)) throw unexpected();
  const event = value.event;
  if (typeof event.name !== "string") throw unexpected();
  const participant = isRecord(value.participant) ? value.participant : {};
  const features = isRecord(value.features) ? value.features : {};
  return {
    event: {
      eventId: typeof event.eventId === "string" ? event.eventId : "",
      name: event.name,
      status: isStatus(event.status) ? event.status : "ACTIVE",
      startDate: stringOrNull(event.startDate),
      endDate: stringOrNull(event.endDate),
      place: stringOrNull(event.place),
      timeZone: typeof event.timeZone === "string" && event.timeZone ? event.timeZone : "Asia/Seoul",
    },
    participant: {
      name: typeof participant.name === "string" ? participant.name : "",
      applicationStatus: participant.applicationStatus === "NONE" ? "NONE" : "SUBMITTED",
    },
    completionNotice: completionText(value),
    features: {
      schedule: features.schedule === true,
      notices: features.notices === true,
      groups: features.groups === true,
      rooms: features.rooms === true,
      mealOrder: features.mealOrder === true,
    },
    updates: parseUpdates(value.updates),
  };
}

/**
 * The one place that reads the completion notice from `home`. The contract draft has
 * `completionMessage: { text, updatedAt }`, api.md (A8) has `completionNotice: string | null`; B2
 * settles one. Both are read until then; a blank text is no notice.
 */
export function completionText(home: Record<string, unknown>): string | null {
  const plain = home.completionNotice;
  if (typeof plain === "string") return plain.trim().length > 0 ? plain : null;
  const message = home.completionMessage;
  if (isRecord(message) && typeof message.text === "string") {
    return message.text.trim().length > 0 ? message.text : null;
  }
  return null;
}

export function parseUpdates(value: unknown): ParticipantUpdates | null {
  if (!isRecord(value)) return null;
  const versions: Partial<Record<FeedKey, number>> = {};
  for (const key of FEED_KEYS) {
    const item = value[key];
    if (typeof item === "number" && Number.isFinite(item)) versions[key] = item;
  }
  const notifications = isRecord(value.notifications)
    ? {
        latestSeq: numberOr(value.notifications.latestSeq, 0),
        unreadCount: numberOr(value.notifications.unreadCount, 0),
      }
    : null;
  return {
    versions,
    notifications,
    pollAfterSeconds: clampPoll(value.pollAfterSeconds),
    serverTime: typeof value.serverTime === "string" ? value.serverTime : null,
  };
}

function clampPoll(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_POLL_SECONDS;
  return Math.min(MAX_POLL_SECONDS, Math.max(MIN_POLL_SECONDS, value));
}

function isStatus(value: unknown): value is ParticipantEventStatus {
  return value === "DRAFT" || value === "ACTIVE" || value === "ENDED" || value === "ARCHIVED";
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unexpected(): ApiError {
  return new ApiError({ status: 200, code: "UNEXPECTED" });
}
