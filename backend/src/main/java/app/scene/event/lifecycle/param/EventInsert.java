package app.scene.event.lifecycle.param;

import java.time.LocalDate;
import java.util.UUID;

/** Values for one new event row. Status and version are fixed in the statement. */
public final class EventInsert {

  private final UUID id;
  private final UUID spaceId;
  private final String name;
  private final LocalDate startDate;
  private final LocalDate endDate;
  private final String place;
  private final String eventType;

  private EventInsert(
      UUID id,
      UUID spaceId,
      String name,
      LocalDate startDate,
      LocalDate endDate,
      String place,
      String eventType) {
    this.id = id;
    this.spaceId = spaceId;
    this.name = name;
    this.startDate = startDate;
    this.endDate = endDate;
    this.place = place;
    this.eventType = eventType;
  }

  public static EventInsert of(
      UUID id,
      UUID spaceId,
      String name,
      LocalDate startDate,
      LocalDate endDate,
      String place,
      String eventType) {
    return new EventInsert(id, spaceId, name, startDate, endDate, place, eventType);
  }

  public UUID getId() {
    return id;
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public String getName() {
    return name;
  }

  public LocalDate getStartDate() {
    return startDate;
  }

  public LocalDate getEndDate() {
    return endDate;
  }

  public String getPlace() {
    return place;
  }

  public String getEventType() {
    return eventType;
  }
}
