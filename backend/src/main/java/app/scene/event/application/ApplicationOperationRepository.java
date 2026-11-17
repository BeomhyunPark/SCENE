package app.scene.event.application;

import app.scene.event.application.mapper.ApplicationOperationMapper;
import app.scene.event.application.param.ApplicationKey;
import app.scene.event.application.param.EventApplicationKey;
import app.scene.event.application.param.OperationWrite;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** One row per application. Writes compare the stored version. */
@Component
public class ApplicationOperationRepository {

  private final ApplicationOperationMapper operations;

  public ApplicationOperationRepository(ApplicationOperationMapper operations) {
    this.operations = operations;
  }

  public ApplicationOperation find(UUID spaceId, UUID eventId, UUID applicationId) {
    ApplicationOperationRow row =
        operations.find(ApplicationKey.of(spaceId, eventId, applicationId));
    return row == null ? ApplicationOperation.empty() : row.operation();
  }

  /**
   * Stored operator values of the event by application id. Applications without a row are absent.
   */
  public Map<UUID, ApplicationOperation> byApplication(UUID spaceId, UUID eventId) {
    Map<UUID, ApplicationOperation> out = new HashMap<>();
    for (ApplicationOperationRow row :
        operations.listByEvent(EventApplicationKey.of(spaceId, eventId))) {
      out.put(row.applicationId(), row.operation());
    }
    return out;
  }

  /**
   * Stores {@code memo} when the stored version equals {@code expectedVersion}. Version 0 means
   * nothing is stored yet. Returns false when another write came first.
   */
  public boolean write(
      UUID spaceId,
      UUID eventId,
      UUID applicationId,
      String memo,
      int expectedVersion,
      UUID updatedBy,
      Instant updatedAt) {
    OperationWrite write =
        OperationWrite.of(
            spaceId, eventId, applicationId, memo, expectedVersion, updatedBy, updatedAt);
    if (expectedVersion == 0) {
      return operations.insertFirst(write) == 1;
    }
    return operations.updateVersion(write) == 1;
  }
}
