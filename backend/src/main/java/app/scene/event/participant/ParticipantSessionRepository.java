package app.scene.event.participant;

import app.scene.event.participant.mapper.ParticipantSessionMapper;
import app.scene.event.participant.mapper.ParticipantSessionQueryMapper;
import app.scene.event.participant.param.ParticipantSessionInsert;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Participant session rows. The raw token is not stored. Logout deletes the row. */
@Component
public class ParticipantSessionRepository {

  private final ParticipantSessionMapper sessions;
  private final ParticipantSessionQueryMapper queries;
  private final ParticipantProperties properties;

  public ParticipantSessionRepository(
      ParticipantSessionMapper sessions,
      ParticipantSessionQueryMapper queries,
      ParticipantProperties properties) {
    this.sessions = sessions;
    this.queries = queries;
    this.properties = properties;
  }

  @Transactional
  public void save(ParticipantSessionInsert insert) {
    if (sessions.save(insert) != 1) {
      throw new IllegalStateException("participant session was not stored");
    }
  }

  /** A session that has not passed the event's end limit (DEC-078 §3). */
  public Optional<ParticipantSelf> findByTokenHash(String tokenHash, Instant now) {
    return Optional.ofNullable(
        queries.findByTokenHash(
            tokenHash, now, properties.zone(), properties.sessionDaysAfterEnd()));
  }

  /** The event's end date, or null. */
  public java.time.LocalDate findEventEndDate(UUID spaceId, UUID eventId) {
    return queries.findEventEndDate(spaceId, eventId);
  }

  @Transactional
  public void deleteByTokenHash(String tokenHash) {
    sessions.deleteByTokenHash(tokenHash);
  }

  /** Deletes every session of the participant, keeping {@code keepTokenHash} when not null. */
  @Transactional
  public void deleteByParticipant(
      UUID spaceId, UUID eventId, UUID participantId, String keepTokenHash) {
    sessions.deleteByParticipant(spaceId, eventId, participantId, keepTokenHash);
  }
}
