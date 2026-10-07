package app.scene.space;

import app.scene.space.mapper.EventUserPermissionMapper;
import app.scene.space.mapper.EventUserPermissionQueryMapper;
import app.scene.space.param.EventOperatorKey;
import app.scene.space.param.PermissionEffectQuery;
import app.scene.space.param.PermissionOverrideWrite;
import java.time.Instant;
import java.util.List;
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

  public List<PermissionOverride> findAll(UUID spaceId, UUID eventId, UUID userId) {
    return queries.findAll(EventOperatorKey.of(spaceId, eventId, userId));
  }

  @Transactional
  public int save(
      UUID spaceId,
      UUID eventId,
      UUID userId,
      String permission,
      String effect,
      UUID grantedBy,
      Instant grantedAt) {
    return permissions.save(
        PermissionOverrideWrite.of(
            spaceId, eventId, userId, permission, effect, grantedBy, grantedAt));
  }

  @Transactional
  public int update(
      UUID spaceId,
      UUID eventId,
      UUID userId,
      String permission,
      String effect,
      UUID grantedBy,
      Instant grantedAt) {
    return permissions.update(
        PermissionOverrideWrite.of(
            spaceId, eventId, userId, permission, effect, grantedBy, grantedAt));
  }

  @Transactional
  public int deleteOne(UUID spaceId, UUID eventId, UUID userId, String permission) {
    return permissions.deleteOne(PermissionEffectQuery.of(spaceId, eventId, userId, permission));
  }

  @Transactional
  public int delete(UUID spaceId, UUID eventId, UUID userId) {
    return permissions.delete(EventOperatorKey.of(spaceId, eventId, userId));
  }
}
