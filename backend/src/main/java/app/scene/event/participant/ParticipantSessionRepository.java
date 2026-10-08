package app.scene.event.participant;

import app.scene.event.participant.mapper.ParticipantSessionMapper;
import app.scene.event.participant.mapper.ParticipantSessionQueryMapper;
import app.scene.event.participant.param.ParticipantSessionInsert;
import java.util.Optional;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Participant session rows. The raw token is not stored. Logout deletes the row. */
@Component
public class ParticipantSessionRepository {

  private final ParticipantSessionMapper sessions;
  private final ParticipantSessionQueryMapper queries;

  public ParticipantSessionRepository(
      ParticipantSessionMapper sessions, ParticipantSessionQueryMapper queries) {
    this.sessions = sessions;
    this.queries = queries;
  }

  @Transactional
  public void save(ParticipantSessionInsert insert) {
    if (sessions.save(insert) != 1) {
      throw new IllegalStateException("participant session was not stored");
    }
  }

  public Optional<ParticipantSelf> findByTokenHash(String tokenHash) {
    return Optional.ofNullable(queries.findByTokenHash(tokenHash));
  }

  @Transactional
  public void deleteByTokenHash(String tokenHash) {
    sessions.deleteByTokenHash(tokenHash);
  }
}
