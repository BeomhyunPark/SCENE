package app.scene.event.lifecycle.param;

import app.scene.common.mybatis.PageParam;
import java.util.UUID;

/**
 * Events in one space. {@code userId} is set only when the caller may see the events they operate.
 * The order clause is a server constant, never client text.
 */
public final class EventListQuery {

  private final UUID spaceId;
  private final UUID userId;
  private final PageParam page;

  private EventListQuery(UUID spaceId, UUID userId, PageParam page) {
    this.spaceId = spaceId;
    this.userId = userId;
    this.page = page;
  }

  public static EventListQuery of(UUID spaceId, UUID userId, PageParam page) {
    return new EventListQuery(spaceId, userId, page);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getUserId() {
    return userId;
  }

  public PageParam getPage() {
    return page;
  }
}
