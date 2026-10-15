package app.scene.common.tenant.param;

import app.scene.common.mybatis.PageParam;
import java.util.UUID;

/** Active memberships of one user. The order clause is a server constant. */
public final class SpaceMembershipListQuery {

  private final UUID userId;
  private final PageParam page;

  private SpaceMembershipListQuery(UUID userId, PageParam page) {
    this.userId = userId;
    this.page = page;
  }

  public static SpaceMembershipListQuery of(UUID userId, PageParam page) {
    return new SpaceMembershipListQuery(userId, page);
  }

  public UUID getUserId() {
    return userId;
  }

  public PageParam getPage() {
    return page;
  }
}
