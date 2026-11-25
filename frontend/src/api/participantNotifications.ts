import { apiRequest } from "./client";
import { ApiError } from "./errors";
import { parseNotificationPage, type NotificationPage, type OperatorNotification } from "./operatorNotifications";

/**
 * The participant's own notifications (DEC-080 §7.4, api.md "참가자 알림", B5 #463). The same shape
 * as the operator list: `kind` is a §7.2 value, and a kind the screen does not know shows its title
 * and body and cannot be opened. Reading the list does not mark anything read.
 */
export type ParticipantNotification = OperatorNotification;
export type ParticipantNotificationPage = NotificationPage;

export type ParticipantNotificationReadBody =
  | { notificationIds: string[] }
  | { target: { type: string; id: string | null } }
  | { upToSeq: number };

export function listParticipantNotifications(before: number | null, signal?: AbortSignal): Promise<ParticipantNotificationPage> {
  return apiRequest<unknown>("/api/v1/participant/notifications", {
    query: { before: before ?? undefined, limit: 30 },
    signal,
  }).then(parseNotificationPage);
}

/** Returns the new unread count. */
export function markParticipantNotificationsRead(body: ParticipantNotificationReadBody): Promise<number> {
  return apiRequest<unknown>("/api/v1/participant/notifications/read", { method: "POST", body }).then((value) => {
    if (typeof value !== "object" || value === null || typeof (value as { unreadCount?: unknown }).unreadCount !== "number") {
      throw new ApiError({ status: 200, code: "UNEXPECTED" });
    }
    return (value as { unreadCount: number }).unreadCount;
  });
}
