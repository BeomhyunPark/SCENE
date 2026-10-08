package app.scene.event.form.param;

import java.util.UUID;

/** Fields of one form. The order clause is a server constant, never client text. */
public final class FieldListQuery {

  private final UUID spaceId;
  private final UUID eventId;
  private final UUID formId;
  private final String orderByClause;

  private FieldListQuery(UUID spaceId, UUID eventId, UUID formId, String orderByClause) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.formId = formId;
    this.orderByClause = orderByClause;
  }

  public static FieldListQuery of(UUID spaceId, UUID eventId, UUID formId, String orderByClause) {
    return new FieldListQuery(spaceId, eventId, formId, orderByClause);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }

  public UUID getFormId() {
    return formId;
  }

  public String getOrderByClause() {
    return orderByClause;
  }
}
