package app.scene.event.schedule.param;

import java.time.Instant;
import java.util.UUID;

/** Mapper parameter for schedule reads and writes. Unused fields stay null. */
public final class ScheduleParam {

  private final UUID spaceId;
  private final UUID eventId;
  private UUID itemId;
  private int day;
  private String startTime;
  private String endTime;
  private String title;
  private String place;
  private String description;
  private String category;
  private String audience;
  private String slotId;
  private int sortOrder;
  private UUID actorUserId;
  private Instant at;
  private UUID publicationId;
  private long boardVersion;
  private String snapshot;
  private String changes;

  private ScheduleParam(UUID spaceId, UUID eventId) {
    this.spaceId = spaceId;
    this.eventId = eventId;
  }

  public static ScheduleParam of(UUID spaceId, UUID eventId) {
    return new ScheduleParam(spaceId, eventId);
  }

  public ScheduleParam item(UUID value) {
    this.itemId = value;
    return this;
  }

  public ScheduleParam slot(String value) {
    this.slotId = value;
    return this;
  }

  public ScheduleParam at(Instant value) {
    this.at = value;
    return this;
  }

  public ScheduleParam actor(UUID userId, Instant value) {
    this.actorUserId = userId;
    this.at = value;
    return this;
  }

  /** Item content columns. */
  public ScheduleParam content(
      int day,
      String startTime,
      String endTime,
      String title,
      String place,
      String description,
      String category,
      String audience,
      String slotId,
      int sortOrder) {
    this.day = day;
    this.startTime = startTime;
    this.endTime = endTime;
    this.title = title;
    this.place = place;
    this.description = description;
    this.category = category;
    this.audience = audience;
    this.slotId = slotId;
    this.sortOrder = sortOrder;
    return this;
  }

  public ScheduleParam time(int day, String startTime) {
    this.day = day;
    this.startTime = startTime;
    return this;
  }

  public ScheduleParam publication(
      UUID publicationId, long boardVersion, String snapshot, String changes) {
    this.publicationId = publicationId;
    this.boardVersion = boardVersion;
    this.snapshot = snapshot;
    this.changes = changes;
    return this;
  }
}
