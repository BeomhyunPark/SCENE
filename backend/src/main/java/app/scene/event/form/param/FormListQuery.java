package app.scene.event.form.param;

import app.scene.common.mybatis.PageParam;
import java.util.UUID;

/** Paged forms for one event. The order clause is a server constant. */
public final class FormListQuery {

  private final UUID spaceId;
  private final UUID eventId;
  private final PageParam page;

  private FormListQuery(UUID spaceId, UUID eventId, PageParam page) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.page = page;
  }

  public static FormListQuery of(UUID spaceId, UUID eventId, PageParam page) {
    return new FormListQuery(spaceId, eventId, page);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }

  public PageParam getPage() {
    return page;
  }
}
