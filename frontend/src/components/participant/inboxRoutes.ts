import type { ParticipantFeatureKey, ParticipantFeatures } from "../../api/participantHome";
import type { ParticipantNotification } from "../../api/participantNotifications";
import { participantPath } from "./participantTabs";

/**
 * Participant notification kind → the screen it opens (DEC-080 §7.2, B5 #463). The one place to add
 * a route. A kind missing here, a notice without an id, or an area that is off (`home.features`)
 * shows its title and body and cannot be opened, so a new server kind never breaks the inbox.
 */
type Route = { feature: ParticipantFeatureKey | null; needsId: boolean; href: (eventId: string, id: string | null) => string };

const ROUTES: Record<string, Route> = {
  NOTICE_PUBLISHED: { feature: "notices", needsId: true, href: (eventId, id) => participantPath(eventId, "notices", id ?? "") },
  NOTICE_UPDATED: { feature: "notices", needsId: true, href: (eventId, id) => participantPath(eventId, "notices", id ?? "") },
  SCHEDULE_PUBLISHED: { feature: "schedule", needsId: false, href: (eventId) => participantPath(eventId, "schedule") },
  SCHEDULE_CHANGED: { feature: "schedule", needsId: false, href: (eventId) => participantPath(eventId, "schedule") },
  // The target is the person's group, or null when they left every group: 내 조 shows either.
  GROUP_PUBLISHED: { feature: "groups", needsId: false, href: (eventId) => participantPath(eventId, "group") },
  // G4's screen (#459) shows the person's room, or that they have none.
  ROOM_PUBLISHED: { feature: "rooms", needsId: false, href: (eventId) => `/participate/${eventId}/rooms` },
  // A12 (#462): the operator changed my application; 내 정보 shows it.
  APPLICATION_UPDATED_BY_OPERATOR: { feature: null, needsId: false, href: (eventId) => participantPath(eventId, "me") },
};

/** Where a notification opens, or null when it cannot be opened now. */
export function inboxHref(eventId: string, item: ParticipantNotification, features: ParticipantFeatures | null): string | null {
  const route = Object.hasOwn(ROUTES, item.kind) ? ROUTES[item.kind] : undefined;
  if (!route) return null;
  if (route.needsId && !item.target.id) return null;
  if (route.feature && !(features?.[route.feature] ?? false)) return null;
  return route.href(eventId, item.target.id);
}

/** The inbox's own address. It stays under the 홈 tab: the five bottom tabs do not change. */
export function inboxPath(eventId: string): string {
  return `/participate/${eventId}/inbox`;
}
