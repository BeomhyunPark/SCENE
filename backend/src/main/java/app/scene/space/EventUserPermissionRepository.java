package app.scene.space;

import app.scene.space.mapper.EventUserPermissionMapper;
import app.scene.space.mapper.EventUserPermissionQueryMapper;
import app.scene.space.param.EventOperatorKey;
import app.scene.space.param.PermissionEffectQuery;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class EventUserPermissionRepository {

  private final EventUserPermissionMapper permissions;
  private final EventUserPermissionQueryMapper queries;

  public EventUserPermissionRepository(
      EventUserPermissionMapper permissions, EventUserPermissionQueryMapper queries) {
    this.permissions = permissions;
    this.queries = queries;
  }

  public Optional<String> findEffect(UUID spaceId, UUID eventId, UUID userId, String permission) {
    return Optional.ofNullable(
        queries.findEffect(PermissionEffectQuery.of(spaceId, eventId, userId, permission)));
  }

  public String findSnapshot(UUID spaceId, UUID eventId, UUID userId) {
    return queries.findSnapshot(EventOperatorKey.of(spaceId, eventId, userId));
  }

  @Transactional
  public void delete(UUID spaceId, UUID eventId, UUID userId) {
    permissions.delete(EventOperatorKey.of(spaceId, eventId, userId));
  }
}
