package app.scene.event.lifecycle.param;

import app.scene.common.mybatis.PageParam;
import java.util.UUID;

/** Paged invitations of one status for one event. The order clause is a server constant. */
public final class InvitationListQuery {

  private final UUID spaceId;
  private final UUID eventId;
  private final String status;
  private final PageParam page;

  private InvitationListQuery(UUID spaceId, UUID eventId, String status, PageParam page) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.status = status;
    this.page = page;
  }

  public static InvitationListQuery of(UUID spaceId, UUID eventId, String status, PageParam page) {
    return new InvitationListQuery(spaceId, eventId, status, page);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }

  public String getStatus() {
    return status;
  }

  public PageParam getPage() {
    return page;
  }
}
