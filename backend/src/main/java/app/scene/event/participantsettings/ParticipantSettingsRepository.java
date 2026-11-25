package app.scene.event.participantsettings;

import app.scene.event.participantsettings.mapper.ParticipantSettingsMapper;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * One row per event in {@code event_participant_settings}; no row means the defaults. Writes
 * compare the stored version. Participant reads use {@link #groupRosterVisibleToMembers}.
 */
@Component
public class ParticipantSettingsRepository {

  private final ParticipantSettingsMapper settings;

  public ParticipantSettingsRepository(ParticipantSettingsMapper settings) {
    this.settings = settings;
  }

  public Optional<ParticipantSettingsRow> find(UUID spaceId, UUID eventId) {
    return Optional.ofNullable(settings.find(spaceId, eventId));
  }

  /** Whether ordinary members see their group's roster (DEC-083 §2). Default on. */
  public boolean groupRosterVisibleToMembers(UUID spaceId, UUID eventId) {
    return find(spaceId, eventId)
        .map(ParticipantSettingsRow::groupRosterVisibleToMembers)
        .orElse(ParticipantSettings.ROSTER_VISIBLE_DEFAULT);
  }

  /**
   * Stores the settings when the stored version equals {@code expectedVersion}; version 0 means
   * nothing is stored yet. Returns false when another write came first.
   */
  boolean write(
      UUID spaceId,
      UUID eventId,
      boolean rosterVisible,
      int expectedVersion,
      UUID updatedBy,
      Instant updatedAt) {
    if (expectedVersion == 0) {
      return settings.insertFirst(spaceId, eventId, rosterVisible, updatedBy, updatedAt) == 1;
    }
    return settings.updateVersion(
            spaceId, eventId, rosterVisible, expectedVersion, updatedBy, updatedAt)
        == 1;
  }
}
