import type { OperatorNotification } from "../api/operatorNotifications";

/**
 * Notification kind → the screen it opens (DEC-080 §7.1, #436). The one place to add a route: a
 * kind missing here (or a target without an id) shows its title and body and cannot be opened.
 * `STAFF_NOTICE_PUBLISHED`·`STAFF_NOTICE_UPDATED` (D2, target `NOTICE`) wait for the operator
 * notice screen (D3): that session adds one line here.
 */
const ROUTES: Record<string, (eventId: string, targetId: string) => string> = {
  APPLICATION_REVISED: (eventId, id) => `/events/${eventId}/participants/${id}`,
  APPLICATION_RESUBMITTED: (eventId, id) => `/events/${eventId}/participants/${id}`,
  APPLICATION_CANCELLED: (eventId, id) => `/events/${eventId}/participants/${id}`,
  APPLICATION_RESTORED: (eventId, id) => `/events/${eventId}/participants/${id}`,
  LIFECYCLE_OVERRIDE: (eventId) => `/events/${eventId}`,
};

/** Where a notification opens, or null when the screen cannot open it. */
export function notificationHref(eventId: string, item: OperatorNotification): string | null {
  const route = Object.hasOwn(ROUTES, item.kind) ? ROUTES[item.kind] : undefined;
  if (!route || !item.target.id) return null;
  return route(eventId, item.target.id);
}
