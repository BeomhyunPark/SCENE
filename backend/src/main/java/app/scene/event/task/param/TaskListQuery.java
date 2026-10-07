package app.scene.event.task.param;

import app.scene.common.mybatis.PageParam;
import java.util.UUID;

/** Paged task list. The order clause is a server constant, never client text. */
public final class TaskListQuery {

  private final UUID spaceId;
  private final UUID eventId;
  private final PageParam page;

  private TaskListQuery(UUID spaceId, UUID eventId, PageParam page) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.page = page;
  }

  public static TaskListQuery of(UUID spaceId, UUID eventId, PageParam page) {
    return new TaskListQuery(spaceId, eventId, page);
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
