package app.scene.event.home;

import app.scene.event.EventType;
import app.scene.event.feed.FeedVersions;

/**
 * Which participant areas are on (DEC-080 §2). Before I5 ({@code event_features}) two rules decide:
 *
 * <ol>
 *   <li>Event type default: {@code RETREAT} and {@code CAMP} turn all five on; other types and no
 *       type turn on {@code schedule} and {@code notices}.
 *   <li>An area with something published is on: its {@code participant_feed_versions} value is
 *       above 0. Publish paths bump that value, so schedule, notices, rooms and meal order turn on
 *       by themselves without this class reading their tables.
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
        all || versions.mealOrder() > 0);
  }
}
