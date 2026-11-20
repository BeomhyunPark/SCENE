package app.scene.event.schedule;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import tools.jackson.databind.JsonNode;

/**
 * Stored content of one publication (DEC-081 §1, §6, schedule-contract §11): every item of the
 * working copy at publication time with its change mark, and the items removed within the last 24
 * hours. No personal data.
 */
public record ScheduleSnapshot(List<Item> items, List<Removed> removedItems) {

  public static final ScheduleSnapshot EMPTY = new ScheduleSnapshot(List.of(), List.of());

  public ScheduleSnapshot {
    items = items == null ? List.of() : List.copyOf(items);
    removedItems = removedItems == null ? List.of() : List.copyOf(removedItems);
  }

  /** One published item. {@code audience} is the stored DEC-080 shape. */
  public record Item(
      UUID itemId,
      int day,
      String startTime,
      String endTime,
      String title,
      String place,
      String description,
      String category,
      JsonNode audience,
      String slotId,
      int sortOrder,
      Change change) {}

  /**
   * The change mark. {@code kind} is {@code ADDED} or {@code CHANGED}; {@code changedAt} is the
   * publication that made it; {@code fields} names the changed fields ({@code []} for ADDED);
   * {@code previous} holds the earlier {@code day}, {@code startTime}, {@code endTime}, {@code
   * place} among {@code fields} (null for ADDED).
   */
  public record Change(
      String kind, Instant changedAt, List<String> fields, Map<String, Object> previous) {}

  /** An item removed by a publication within the last 24 hours. */
  public record Removed(
      UUID itemId, int day, String title, String startTime, JsonNode audience, Instant removedAt) {}
}
