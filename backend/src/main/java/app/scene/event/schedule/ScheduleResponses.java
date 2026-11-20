package app.scene.event.schedule;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import tools.jackson.databind.JsonNode;

/** JSON bodies of the schedule paths (api.md "일정표"). */
public final class ScheduleResponses {

  private ScheduleResponses() {}

  /** {@code publishState} values. */
  static final String UNCHANGED = "UNCHANGED";

  static final String ADDED = "ADDED";
  static final String CHANGED = "CHANGED";

  /** One working-copy item for operators. */
  public record OperatorItem(
      UUID itemId,
      int day,
      String date,
      String startTime,
      String endTime,
      boolean endsNextDay,
      String startsAt,
      String endsAt,
      String title,
      String place,
      String description,
      String category,
      JsonNode audience,
      boolean leadersOnly,
      String slotId,
      int sortOrder,
      int version,
      Instant updatedAt,
      String updatedByDisplayName,
      String publishState,
      boolean outOfPeriod) {}

  /** {@code GET …/schedule}. */
  public record Board(
      String eventStatus,
      long boardVersion,
      LocalDate startDate,
      LocalDate endDate,
      String timeZone,
      List<ScheduleViews.Day> days,
      List<OperatorItem> items,
      Publication publication,
      List<Slot> slots) {}

  /** Against the latest publication. {@code last*} are null before the first publication. */
  public record Publication(
      Instant lastPublishedAt,
      String lastPublishedByDisplayName,
      Long lastPublishedBoardVersion,
      boolean hasUnpublishedChanges,
      PendingChanges pendingChanges) {}

  public record PendingChanges(int added, int changed, int removed) {}

  /** A form-setup slot (same as the group board's) and the item holding its id, or null. */
  public record Slot(
      String slotId,
      int day,
      String date,
      String dayLabel,
      String meal,
      String label,
      int sortOrder,
      UUID linkedItemId) {}

  /** {@code POST …/schedule/publish}, and {@code publication} of a "save and publish". */
  public record PublishResult(
      String result,
      UUID publicationId,
      Instant publishedAt,
      long boardVersion,
      ScheduleChanges changes,
      int notifiedCount) {

    static final String PUBLISHED = "PUBLISHED";
    static final String ALREADY_PUBLISHED = "ALREADY_PUBLISHED";
  }

  /** Item create and update. {@code publication} is null unless {@code publish: true}. */
  public record ItemWritten(OperatorItem item, long boardVersion, PublishResult publication) {}

  /** Item delete. */
  public record ItemDeleted(long boardVersion, PublishResult publication) {}

  /** {@code GET /participant/schedule}. */
  public record ParticipantSchedule(
      String status,
      Instant publishedAt,
      String timeZone,
      Instant serverTime,
      List<ScheduleViews.Day> days,
      List<ParticipantItem> items,
      List<ParticipantRemoved> removedItems) {

    static final String NOT_ELIGIBLE = "NOT_ELIGIBLE";
    static final String NOT_PUBLISHED = "NOT_PUBLISHED";
    static final String PUBLISHED = "PUBLISHED";
  }

  /** A published item as a participant sees it: no {@code audience}, only {@code leadersOnly}. */
  public record ParticipantItem(
      UUID itemId,
      int day,
      String date,
      String startTime,
      String endTime,
      boolean endsNextDay,
      String startsAt,
      String endsAt,
      String title,
      String place,
      String description,
      String category,
      String slotId,
      int sortOrder,
      boolean leadersOnly,
      Change change) {}

  /** Change mark shown for 24 hours. */
  public record Change(
      String kind, Instant changedAt, List<String> fields, Map<String, Object> previous) {}

  public record ParticipantRemoved(
      UUID itemId, int day, String date, String title, String startTime, Instant removedAt) {}

  /** {@code GET …/schedule/published}: every item, with its {@code audience}. */
  public record Published(
      String status,
      Instant publishedAt,
      String publishedByDisplayName,
      Long boardVersion,
      String timeZone,
      Instant serverTime,
      List<ScheduleViews.Day> days,
      List<PublishedItem> items,
      List<PublishedRemoved> removedItems) {}

  public record PublishedItem(
      UUID itemId,
      int day,
      String date,
      String startTime,
      String endTime,
      boolean endsNextDay,
      String startsAt,
      String endsAt,
      String title,
      String place,
      String description,
      String category,
      JsonNode audience,
      boolean leadersOnly,
      String slotId,
      int sortOrder,
      Change change) {}

  public record PublishedRemoved(
      UUID itemId,
      int day,
      String date,
      String title,
      String startTime,
      JsonNode audience,
      Instant removedAt) {}
}
