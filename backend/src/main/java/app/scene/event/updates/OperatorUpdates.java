package app.scene.event.updates;

import app.scene.event.notification.NotificationSummary;
import java.time.Instant;

/**
 * {@code GET /operator/events/{eventId}/updates} (DEC-080 §7.5). The screen compares each value
 * with the last one it read and reloads only what differs: {@code notifications} is the operator's
 * own list (badge and list), {@code notices} the operator-scope notice value (D3), {@code schedule}
 * the working copy's {@code boardVersion} (C4), {@code checkIns} the event's newest check-in log
 * {@code seq} (E1).
 */
public record OperatorUpdates(
    NotificationSummary notifications,
    long notices,
    long schedule,
    long checkIns,
    int pollAfterSeconds,
    Instant serverTime) {}
