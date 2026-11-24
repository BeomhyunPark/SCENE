import { localUsers } from "./fixtures/seed";
import { eventById } from "./operatorStore";
import { requireEventRead } from "./formStore";
import { permissionsFor } from "./taskStore";

/**
 * Shaped like ParticipantSettingsController (DEC-083 §2, #452). Reading is EVENT_READ (or a space
 * OWNER·ADMIN through `requireEventRead`); writing is EVENT_UPDATE. Order: 404·403 → 403 FORBIDDEN →
 * 400 body → 409 EVENT_ARCHIVED → 409 CONCURRENT_MODIFICATION → 200. The same value saves nothing.
 * A change raises `updates.group` through the version the participant feed reads.
 */
type Settings = { groupRosterVisibleToMembers: boolean; version: number; updatedAt: string | null; updatedByDisplayName: string | null };

let settings = new Map<string, Settings>();

export function resetParticipantSettingsStore(): void {
  settings = new Map();
}

function settingsOf(eventId: string): Settings {
  return settings.get(eventId) ?? { groupRosterVisibleToMembers: true, version: 0, updatedAt: null, updatedByDisplayName: null };
}

export function groupRosterVisible(eventId: string): boolean {
  return settingsOf(eventId).groupRosterVisibleToMembers;
}

/** For the participant feed: the settings version raises `updates.group`. */
export function participantSettingsVersion(eventId: string): number {
  return settingsOf(eventId).version;
}

/** Test and mock-click seam. */
export function setGroupRosterVisible(eventId: string, visible: boolean): void {
  const now = settingsOf(eventId);
  if (now.groupRosterVisibleToMembers === visible) return;
  settings.set(eventId, { ...now, groupRosterVisibleToMembers: visible, version: now.version + 1, updatedAt: new Date().toISOString() });
}

export function readParticipantSettings(eventId: string, actorId: string) {
  const gate = requireEventRead(eventId, actorId);
  if (gate) return gate;
  return { ...settingsOf(eventId) };
}

export function saveParticipantSettings(eventId: string, actorId: string, body: unknown) {
  const gate = requireEventRead(eventId, actorId);
  if (gate) return gate;
  const permissions = permissionsFor(eventId, actorId, actorId);
  if ("code" in permissions || !permissions.effective.includes("EVENT_UPDATE")) return { status: 403, code: "FORBIDDEN" };
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  if (typeof record.groupRosterVisibleToMembers !== "boolean") {
    return { status: 400, code: "VALIDATION_FAILED", errors: [{ field: "groupRosterVisibleToMembers" }] };
  }
  const expected = record.expectedVersion;
  if (typeof expected !== "number" || !Number.isInteger(expected) || expected < 0) {
    return { status: 400, code: "VALIDATION_FAILED", errors: [{ field: "expectedVersion" }] };
  }
  if (eventById(eventId)?.lifecycleStatus === "ARCHIVED") return { status: 409, code: "EVENT_ARCHIVED" };
  const now = settingsOf(eventId);
  if (expected !== now.version) return { status: 409, code: "CONCURRENT_MODIFICATION", version: now.version };
  if (record.groupRosterVisibleToMembers === now.groupRosterVisibleToMembers) return { ...now };
  const next = {
    groupRosterVisibleToMembers: record.groupRosterVisibleToMembers,
    version: now.version + 1,
    updatedAt: new Date().toISOString(),
    updatedByDisplayName: localUsers.find((user) => user.userId === actorId)?.displayName ?? "운영자",
  };
  settings.set(eventId, next);
  return { ...next };
}
