package app.scene.common.tenant;

import app.scene.common.mybatis.AuthorityStatuses;
import app.scene.common.permission.Permission;
import app.scene.common.tenant.mapper.EventAccessQueryMapper;
import app.scene.common.tenant.mapper.SpaceAccessQueryMapper;
import app.scene.common.tenant.param.EventAccessQuery;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class OperatorAccessRepository {

  static final String ACCESS_REVOKED = "EVENT_ACCESS_REVOKED";

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
                ACCESS_REVOKED,
                Permission.EVENT_READ.name(),
                AuthorityStatuses.ENDED)));
  }

  public Optional<SpaceAccessRow> findSpace(UUID spaceId, UUID userId) {
    return Optional.ofNullable(spaces.findSpace(spaceId, userId));
  }
}
