package app.scene.common.audit;

import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Insert-only audit log. The detail string is stored unchanged. The insert joins the caller
 * transaction, so a failed command rolls it back.
 */
@Component
public class AuditLogRepository {

  private final AuditLogMapper logs;

  public AuditLogRepository(AuditLogMapper logs) {
    this.logs = logs;
  }

  @Transactional(propagation = Propagation.REQUIRED)
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
