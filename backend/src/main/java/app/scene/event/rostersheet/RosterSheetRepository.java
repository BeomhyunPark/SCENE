package app.scene.event.rostersheet;

import app.scene.event.rostersheet.mapper.RosterSheetMapper;
import app.scene.event.rostersheet.param.RosterSheetKey;
import app.scene.event.rostersheet.param.RosterSheetWrite;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** One row per event. Writes compare the stored version. */
@Component
public class RosterSheetRepository {

  private final RosterSheetMapper sheets;

  public RosterSheetRepository(RosterSheetMapper sheets) {
    this.sheets = sheets;
  }

  public Optional<RosterSheetRow> find(UUID spaceId, UUID eventId) {
    return Optional.ofNullable(sheets.find(RosterSheetKey.of(spaceId, eventId)));
  }

  /** Stores {@code doc} when the stored version equals {@code expectedVersion} (0: none yet). */
  public boolean write(
      UUID spaceId, UUID eventId, String doc, int expectedVersion, UUID updatedBy, Instant at) {
    RosterSheetWrite write =
        RosterSheetWrite.of(spaceId, eventId, doc, expectedVersion, updatedBy, at);
    if (expectedVersion == 0) {
      return sheets.insertFirst(write) == 1;
    }
    return sheets.updateVersion(write) == 1;
  }
}
