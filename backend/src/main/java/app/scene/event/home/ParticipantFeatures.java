package app.scene.event.home;

import app.scene.event.EventType;
import app.scene.event.feed.FeedVersions;

/**
 * Which participant areas are on (DEC-080 §2). Before I5 ({@code event_features}) two rules decide:
 *
 * <ol>
 *   <li>Event type default: {@code RETREAT} and {@code CAMP} turn {@code groups} and {@code rooms}
 *       on; other types and no type turn on {@code schedule} and {@code notices} only. Meal order
 *       is never on by default: it is out of the January 2027 scope (DEC-086 is on hold, decided
 *       2026-11-20).
 *   <li>An area with something published is on: its {@code participant_feed_versions} value is
 *       above 0. Publish paths bump that value, so schedule, notices and rooms turn on by
 *       themselves without this class reading their tables. Meal order has no publish path yet, so
 *       it stays off; the key stays in the answer so screens need no change when it comes back.
 * </ol>
 *
 * I5 adds the operator's stored choice in front of rule 1; the answer shape stays.
 */
public record ParticipantFeatures(
    boolean schedule, boolean notices, boolean groups, boolean rooms, boolean mealOrder) {

  public static ParticipantFeatures of(String eventType, FeedVersions versions) {
    boolean all =
        EventType.RETREAT.name().equals(eventType) || EventType.CAMP.name().equals(eventType);
    return new ParticipantFeatures(
        true,
        true,
        all || versions.groups() > 0,
        all || versions.rooms() > 0,
        versions.mealOrder() > 0);
  }
}
