package app.scene.event.application.param;

import app.scene.common.mybatis.PageParam;
import java.util.UUID;

/** Paged applications for one event. The order clause is a server constant. */
public final class ApplicationListQuery {

  private final UUID spaceId;
  private final UUID eventId;
  private final PageParam page;

  private ApplicationListQuery(UUID spaceId, UUID eventId, PageParam page) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.page = page;
  }

  public static ApplicationListQuery of(UUID spaceId, UUID eventId, PageParam page) {
    return new ApplicationListQuery(spaceId, eventId, page);
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
