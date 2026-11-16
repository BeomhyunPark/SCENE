package app.scene.event.retrospective;

import app.scene.event.retrospective.mapper.RetrospectiveMapper;
import app.scene.event.retrospective.param.RetrospectiveKey;
import app.scene.event.retrospective.param.RetrospectiveWrite;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** One row per event. Writes compare the stored version. */
@Component
public class RetrospectiveRepository {

  private final RetrospectiveMapper retrospectives;

  public RetrospectiveRepository(RetrospectiveMapper retrospectives) {
    this.retrospectives = retrospectives;
  }

  public Optional<RetrospectiveRow> find(UUID spaceId, UUID eventId) {
    return Optional.ofNullable(retrospectives.find(RetrospectiveKey.of(spaceId, eventId)));
  }

  /**
   * Stores {@code body} when the stored version equals {@code expectedVersion}. Version 0 means
   * nothing is stored yet. Returns false when another write came first.
   */
  public boolean write(
      UUID spaceId,
      UUID eventId,
      String body,
      int expectedVersion,
      UUID updatedBy,
      Instant updatedAt) {
    RetrospectiveWrite write =
        RetrospectiveWrite.of(spaceId, eventId, body, expectedVersion, updatedBy, updatedAt);
    if (expectedVersion == 0) {
      return retrospectives.insertFirst(write) == 1;
    }
    return retrospectives.updateVersion(write) == 1;
  }
}
