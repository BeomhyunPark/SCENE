package app.scene.event.lifecycle.param;

import app.scene.common.mybatis.PageParam;
import java.util.UUID;

/** Paged lifecycle history. The order clause is built in the repository. */
public final class LifecycleTransitionListQuery {

  private final UUID spaceId;
  private final UUID eventId;
  private final PageParam page;

  private LifecycleTransitionListQuery(UUID spaceId, UUID eventId, PageParam page) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.page = page;
  }

  public static LifecycleTransitionListQuery of(UUID spaceId, UUID eventId, PageParam page) {
    return new LifecycleTransitionListQuery(spaceId, eventId, page);
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
