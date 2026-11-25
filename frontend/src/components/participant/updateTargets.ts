import type { QueryKey } from "@tanstack/react-query";
import type { FeedKey, ParticipantUpdates } from "../../api/participantHome";
import { queryKeys } from "../../api/queryKeys";

/**
 * Which reads an `updates` key reloads (participant-home-contract §4). This table is the only place
 * that joins the two; the poll hook invalidates exactly these keys when a value differs.
 *
 * Adding a card (C5 일정, D4 공지, G4 숙소, B5 알림함): put the card's `useQuery` under the
 * key already listed here — `queryKeys.participantSchedule(eventId)`, `participantNotices(eventId)`,
 * `participantRooms`, `participantNotifications` — or under a key that starts
 * with it (`[...queryKeys.participantNotices(eventId), "detail", id]`). Nothing else needs to change:
 * invalidation matches by prefix, reloads the queries on screen now, and marks the rest stale so they
 * load when their tab opens. Give those queries `staleTime: Infinity` (see `participantCardQuery`) so
 * a tab switch or window focus does not read again on its own; `updates` is the signal.
 */
export const UPDATE_TARGETS: Record<FeedKey, (eventId: string) => readonly QueryKey[]> = {
  home: (eventId) => [queryKeys.participantHome(eventId)],
  schedule: (eventId) => [queryKeys.participantSchedule(eventId)],
  notices: (eventId) => [queryKeys.participantNotices(eventId)],
  // Becoming or leaving a leader is a group publication; leader-only notices and items change with it.
  group: (eventId) => [
    queryKeys.participantGroup(eventId),
    queryKeys.participantNotices(eventId),
    queryKeys.participantSchedule(eventId),
  ],
  // A leader's member list shows each member's room (api.md "숙소" `GET /participant/rooms`); a room publication does not raise `group`.
  rooms: (eventId) => [queryKeys.participantRooms(eventId), queryKeys.participantGroup(eventId)],
  checkIn: (eventId) => [queryKeys.participantCheckIn(eventId)],
  application: (eventId) => [queryKeys.participantApplication(eventId)],
};

/** Notifications (B5): a new item or a read changes the list and the badge. */
export const NOTIFICATION_TARGETS = (eventId: string): readonly QueryKey[] => [queryKeys.participantNotifications(eventId)];

/**
 * Keys to reload between two `updates` answers. A value counts as changed when it differs, larger or
 * smaller (§4). A key missing from either side is left alone, so a server that adds or drops a key
 * does not reload anything by itself.
 */
export function changedTargets(eventId: string, before: ParticipantUpdates, after: ParticipantUpdates): QueryKey[] {
  const out: QueryKey[] = [];
  const seen = new Set<string>();
  const add = (keys: readonly QueryKey[]) => {
    for (const key of keys) {
      const id = JSON.stringify(key);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(key);
    }
  };
  for (const key of Object.keys(UPDATE_TARGETS) as FeedKey[]) {
    const old = before.versions[key];
    const next = after.versions[key];
    if (old === undefined || next === undefined || old === next) continue;
    add(UPDATE_TARGETS[key](eventId));
  }
  const a = before.notifications;
  const b = after.notifications;
  if (a && b && (a.latestSeq !== b.latestSeq || a.unreadCount !== b.unreadCount)) add(NOTIFICATION_TARGETS(eventId));
  return out;
}

/** Shared query options for participant cards: read once, then only when `updates` says so. */
export const participantCardQuery = {
  staleTime: Infinity,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;
