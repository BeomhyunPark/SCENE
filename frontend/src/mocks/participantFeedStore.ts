import { checkInLogsOf } from "./checkInStore";
import { completionNoticeOf, eventFormId } from "./formStore";
import { publicationCount } from "./groupStore";
import { participantSettingsVersion } from "./participantSettingsStore";
import { participantNotificationSummary } from "./noticeStore";
import { eventById } from "./operatorStore";
import { currentApplicationRevision } from "./participantStore";

/**
 * Shaped like GET /participant/home and /participant/updates (participant-home-contract §3·§4, B2).
 * Event-scope values rise when what they cover changes: the mock compares a signature on each read
 * instead of hooking every write path. Areas without a store yet (schedule, notices) stay 0; rooms rise from `participantRoomStore`. They stay 0 unless a test or a mock click raises them with `bumpFeed`.
 */
type EventKey = "home" | "schedule" | "notices" | "group" | "rooms";

const versions = new Map<string, Record<EventKey, number>>();
const signatures = new Map<string, string>();
let pollAfterSeconds = 25;

export function resetParticipantFeedStore(): void {
  versions.clear();
  signatures.clear();
  pollAfterSeconds = 25;
}

/** Test and mock-click seam: an area was published (`window.sceneMock.feed.bumpFeed(eventId, "notices")`). */
export function bumpFeed(eventId: string, key: EventKey): void {
  const row = rowOf(eventId);
  row[key] += 1;
}

export function setPollAfterSeconds(seconds: number): void {
  pollAfterSeconds = seconds;
}

function rowOf(eventId: string): Record<EventKey, number> {
  let row = versions.get(eventId);
  if (!row) versions.set(eventId, (row = { home: 0, schedule: 0, notices: 0, group: 0, rooms: 0 }));
  return row;
}

/** Raises `key` once when `signature` differs from the last read. The first read only records it. */
function track(eventId: string, key: EventKey, signature: string): void {
  const id = `${eventId}:${key}`;
  const before = signatures.get(id);
  if (before !== undefined && before !== signature) rowOf(eventId)[key] += 1;
  signatures.set(id, signature);
}

const ALL_AREAS = new Set(["RETREAT", "CAMP"]);

export function readFeatures(eventId: string) {
  const event = eventById(eventId);
  const all = event?.eventType ? ALL_AREAS.has(event.eventType) : false;
  return {
    schedule: true,
    notices: true,
    groups: all || publicationCount(eventId) > 0,
    // On once a room publication exists (participant-home-contract §2.3): the server reads `updates.rooms` > 0.
    rooms: all || rowOf(eventId).rooms > 0,
  };
}

function completionNotice(eventId: string): string | null {
  const formId = eventFormId(eventId);
  return formId ? completionNoticeOf(eventId, formId) : null;
}

export function readUpdates(eventId: string, participantId: string) {
  const event = eventById(eventId);
  if (event) {
    const { name, lifecycleStatus, startDate, endDate, place } = event;
    track(eventId, "home", JSON.stringify([name, lifecycleStatus, startDate, endDate, place, completionNotice(eventId), readFeatures(eventId)]));
  }
  // A publish or a roster switch change (DEC-083 §2) raises `group`.
  track(eventId, "group", `${publicationCount(eventId)}:${participantSettingsVersion(eventId)}`);
  const row = rowOf(eventId);
  return {
    ...row,
    checkIn: checkInLogsOf(eventId).filter((log) => log.participantId === participantId).length,
    application: currentApplicationRevision(participantId) ?? 0,
    notifications: participantNotificationSummary(participantId),
    pollAfterSeconds,
    serverTime: new Date().toISOString(),
  };
}

export function readHome(eventId: string, participant: { participantId: string; name: string }) {
  const event = eventById(eventId);
  if (!event) return null;
  const updates = readUpdates(eventId, participant.participantId);
  return {
    event: {
      eventId,
      name: event.name,
      status: event.lifecycleStatus,
      startDate: event.startDate,
      endDate: event.endDate,
      place: event.place,
      timeZone: "Asia/Seoul",
    },
    participant: {
      name: participant.name,
      applicationStatus: currentApplicationRevision(participant.participantId) === null ? "NONE" : "SUBMITTED",
    },
    completionNotice: completionNotice(eventId),
    features: readFeatures(eventId),
    updates,
  };
}
