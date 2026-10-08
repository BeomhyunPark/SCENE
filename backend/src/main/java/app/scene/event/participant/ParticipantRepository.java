package app.scene.event.participant;

import app.scene.event.participant.mapper.ParticipantAccessMapper;
import app.scene.event.participant.mapper.ParticipantMapper;
import app.scene.event.participant.param.ParticipantAccessInsert;
import app.scene.event.participant.param.ParticipantInsert;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Participant identity and access-key hashes. Sessions are not issued here. */
@Component
public class ParticipantRepository {

  private final ParticipantMapper participants;
  private final ParticipantAccessMapper access;

  public ParticipantRepository(ParticipantMapper participants, ParticipantAccessMapper access) {
    this.participants = participants;
    this.access = access;
  }

  @Transactional
  public void save(ParticipantInsert insert) {
    if (participants.save(insert) != 1) {
      throw new IllegalStateException("participant was not stored");
    }
  }

  @Transactional
  public void saveAccess(ParticipantAccessInsert insert) {
    if (access.save(insert) != 1) {
      throw new IllegalStateException("participant access was not stored");
    }
  }
}
