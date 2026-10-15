package app.scene.common.tenant;

import app.scene.common.audit.AuditActions;
import app.scene.common.mybatis.AuthorityStatuses;
import app.scene.common.mybatis.PageParam;
import app.scene.common.permission.Permission;
import app.scene.common.tenant.mapper.EventAccessQueryMapper;
import app.scene.common.tenant.mapper.SpaceAccessQueryMapper;
import app.scene.common.tenant.param.EventAccessQuery;
import app.scene.common.tenant.param.SpaceMembershipListQuery;
import app.scene.common.web.PageRequest;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class OperatorAccessRepository {

  /** Membership lists have no client sort. The clause is a server constant. */
  static final String SPACE_LIST_ORDER = "s.name ASC, s.id ASC";

  private final EventAccessQueryMapper events;
  private final SpaceAccessQueryMapper spaces;

  public OperatorAccessRepository(EventAccessQueryMapper events, SpaceAccessQueryMapper spaces) {
    this.events = events;
    this.spaces = spaces;
  }

  public Optional<EventAccessRow> findEvent(UUID spaceId, UUID eventId, UUID userId) {
    return Optional.ofNullable(
        events.findEvent(
            EventAccessQuery.of(
                spaceId,
                eventId,
                userId,
                AuditActions.EVENT_ACCESS_REVOKED,
                Permission.EVENT_READ.name(),
                AuthorityStatuses.ENDED)));
  }

  public Optional<SpaceAccessRow> findSpace(UUID spaceId, UUID userId) {
    return Optional.ofNullable(spaces.findSpace(spaceId, userId));
  }

  /** Active memberships only. {@code LEFT} rows are not counted. */
  public long countSpaces(UUID userId) {
    return spaces.count(userId);
  }

  public List<SpaceMembershipListRow> findSpaces(UUID userId, PageRequest request) {
    long offset = request.offset();
    if (offset > Integer.MAX_VALUE) {
      throw new IllegalArgumentException("page offset does not fit an int");
    }
    return spaces.findAll(
        SpaceMembershipListQuery.of(
            userId, PageParam.of((int) offset, request.size(), SPACE_LIST_ORDER)));
  }
}
