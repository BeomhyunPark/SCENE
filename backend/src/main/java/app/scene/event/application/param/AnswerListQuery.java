package app.scene.event.application.param;

import java.util.UUID;

/** Answers of one application, ordered by the field position. */
public final class AnswerListQuery {

  private final UUID spaceId;
  private final UUID eventId;
  private final UUID applicationId;
  private final String orderByClause;

  private AnswerListQuery(UUID spaceId, UUID eventId, UUID applicationId, String orderByClause) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.applicationId = applicationId;
    this.orderByClause = orderByClause;
  }

  public static AnswerListQuery of(
      UUID spaceId, UUID eventId, UUID applicationId, String orderByClause) {
    return new AnswerListQuery(spaceId, eventId, applicationId, orderByClause);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }

  public UUID getApplicationId() {
    return applicationId;
  }

  public String getOrderByClause() {
    return orderByClause;
  }
}
