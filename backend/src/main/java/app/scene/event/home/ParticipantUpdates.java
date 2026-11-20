package app.scene.event.home;

import app.scene.event.notification.NotificationSummary;
import java.time.Instant;

/**
 * {@code GET /participant/updates} (DEC-080 §4). The screen compares each value with the last one
 * it read and reloads only the cards whose value differs. Event-scope values ({@code home} … {@code
 * mealOrder}) are the same for every participant of the event; {@code checkIn}, {@code application}
 * and {@code notifications} are the participant's own.
 */
public record ParticipantUpdates(
    long home,
    long schedule,
    long notices,
    long group,
    long rooms,
    long mealOrder,
    long checkIn,
    long application,
    NotificationSummary notifications,
    int pollAfterSeconds,
    Instant serverTime) {}
