package app.scene.common.audit;

import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Insert-only audit log. Callers own the action name and the JSON detail. */
@Component
public class AuditLogRepository {

  private final AuditLogMapper logs;

  public AuditLogRepository(AuditLogMapper logs) {
    this.logs = logs;
  }

  @Transactional
  public void save(
      UUID spaceId,
      UUID eventId,
      UUID actorUserId,
      String action,
      String detail,
      Instant occurredAt) {
    logs.save(
        AuditLog.of(UUID.randomUUID(), spaceId, eventId, actorUserId, action, detail, occurredAt));
  }
}
