package app.scene.space;

import app.scene.common.mybatis.AuthorityStatuses;
import app.scene.space.mapper.EventUserMapper;
import app.scene.space.mapper.EventUserQueryMapper;
import app.scene.space.param.AuthorityQuery;
import app.scene.space.param.EventOperatorKey;
import app.scene.space.param.EventOperatorRoleUpdate;
import app.scene.space.param.OperatedEventQuery;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class EventUserRepository {

  private static final String OWNER = "OWNER";
  private static final String HANDOVER = "HANDOVER";
  private static final List<String> OPEN_TASKS = List.of("TODO", "DOING");

  private final EventUserMapper users;
  private final EventUserQueryMapper queries;

  public EventUserRepository(EventUserMapper users, EventUserQueryMapper queries) {
    this.users = users;
    this.queries = queries;
  }

  public Optional<String> findRole(UUID spaceId, UUID eventId, UUID userId) {
    return Optional.ofNullable(queries.findRole(key(spaceId, eventId, userId)));
  }

  public Optional<String> findRoleForUpdate(UUID spaceId, UUID eventId, UUID userId) {
    return Optional.ofNullable(queries.findRoleForUpdate(key(spaceId, eventId, userId)));
  }

  public Optional<UUID> findForUpdate(UUID spaceId, UUID eventId, UUID userId) {
    return Optional.ofNullable(queries.findForUpdate(key(spaceId, eventId, userId)));
  }

  public List<OperatedEvent> findOperated(UUID spaceId, UUID userId) {
    return queries.findOperated(
        OperatedEventQuery.of(
            spaceId, userId, OWNER, HANDOVER, OPEN_TASKS, AuthorityStatuses.ENDED));
  }

  public boolean existsAuthorityEnded(UUID spaceId, UUID eventId, UUID userId) {
    return queries.existsAuthorityEnded(
        AuthorityQuery.of(spaceId, eventId, userId, AuthorityStatuses.ENDED));
  }

  @Transactional
  public int updateOwner(UUID spaceId, UUID eventId, UUID userId) {
    return users.updateRole(EventOperatorRoleUpdate.of(spaceId, eventId, userId, OWNER));
  }

  @Transactional
  public int saveOwner(UUID spaceId, UUID eventId, UUID userId) {
    return users.save(EventOperatorRoleUpdate.of(spaceId, eventId, userId, OWNER));
  }

  @Transactional
  public int delete(UUID spaceId, UUID eventId, UUID userId) {
    return users.delete(key(spaceId, eventId, userId));
  }

  private static EventOperatorKey key(UUID spaceId, UUID eventId, UUID userId) {
    return EventOperatorKey.of(spaceId, eventId, userId);
  }
}
