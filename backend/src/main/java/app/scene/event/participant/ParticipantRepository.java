package app.scene.event.participant;

import app.scene.event.participant.mapper.ParticipantMapper;
import app.scene.event.participant.param.ParticipantInsert;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Participant identity rows. Access keys are no longer issued (DEC-078 §7). */
@Component
public class ParticipantRepository {

  private final ParticipantMapper participants;

  public ParticipantRepository(ParticipantMapper participants) {
    this.participants = participants;
  }

  @Transactional
  public void save(ParticipantInsert insert) {
    if (participants.save(insert) != 1) {
      throw new IllegalStateException("participant was not stored");
    }
  }

  public Optional<ParticipantIdentity> findByPhoneKey(UUID spaceId, UUID eventId, String phoneKey) {
    return Optional.ofNullable(participants.findByPhoneKey(spaceId, eventId, phoneKey));
  }

  public Optional<ParticipantIdentity> findById(UUID spaceId, UUID eventId, UUID participantId) {
    return Optional.ofNullable(participants.findById(spaceId, eventId, participantId));
  }

  @Transactional
  public void updatePin(
      UUID spaceId,
      UUID eventId,
      UUID participantId,
      String pinHash,
      boolean temporary,
      Instant now) {
    if (participants.updatePin(spaceId, eventId, participantId, pinHash, temporary, now) != 1) {
      throw new IllegalStateException("participant number was not stored");
    }
  }

  @Transactional
  public void updateName(UUID spaceId, UUID eventId, UUID participantId, String name, Instant now) {
    if (participants.updateName(spaceId, eventId, participantId, name, now) != 1) {
      throw new IllegalStateException("participant name was not stored");
    }
  }
}
