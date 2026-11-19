package app.scene.event.lifecycle.param;

import app.scene.common.mybatis.PageParam;
import java.util.UUID;

/**
 * Events the caller has an {@code event_users} row for, across spaces (#387). The order clause is a
 * server constant, never client text.
 */
public final class OperatedEventListQuery {

  private final UUID userId;
  private final PageParam page;

  private OperatedEventListQuery(UUID userId, PageParam page) {
    this.userId = userId;
    this.page = page;
  }

  public static OperatedEventListQuery of(UUID userId, PageParam page) {
    return new OperatedEventListQuery(userId, page);
  }

  public UUID getUserId() {
    return userId;
  }

  public PageParam getPage() {
    return page;
  }
}
