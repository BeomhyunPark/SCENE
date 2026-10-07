package app.scene.space.param;

import app.scene.common.mybatis.PageParam;
import java.util.UUID;

/** Paged operator list. The order clause is built in the repository. */
public final class EventOperatorListQuery {

  private final UUID spaceId;
  private final UUID eventId;
  private final PageParam page;

  private EventOperatorListQuery(UUID spaceId, UUID eventId, PageParam page) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.page = page;
  }

  public static EventOperatorListQuery of(UUID spaceId, UUID eventId, PageParam page) {
    return new EventOperatorListQuery(spaceId, eventId, page);
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
