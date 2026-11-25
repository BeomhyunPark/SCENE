package app.scene.event.privacy;

import app.scene.event.privacy.mapper.PrivacyLogMapper;
import java.time.Clock;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Writes {@code privacy_logs} rows in the caller's transaction ({@code MANDATORY}), so a failed
 * record fails the read that showed the data (DEC-083 §4). Every view is its own row; rows are
 * never merged.
 */
@Component
public class PrivacyLogs {

  public static final String CONTACT_VIEW = "CONTACT_VIEW";

  /** A group leader opened one member's detail ({@code GET /participant/group/members/{id}}). */
  public static final String PARTICIPANT_GROUP_MEMBER = "PARTICIPANT_GROUP_MEMBER";

  private final PrivacyLogMapper logs;
  private final JsonMapper json;
  private final Clock clock;

  public PrivacyLogs(PrivacyLogMapper logs, JsonMapper json, Clock clock) {
    this.logs = logs;
    this.json = json;
    this.clock = clock;
  }

  /**
   * A participant saw another participant's contact. {@code detail} holds ids and field names only.
   */
  @Transactional(propagation = Propagation.MANDATORY)
  public void participantContactView(
      UUID spaceId,
      UUID eventId,
      UUID actorParticipantId,
      UUID subjectParticipantId,
      String channel,
      ObjectNode detail) {
    int rows =
        logs.insertParticipantAction(
            UUID.randomUUID(),
            spaceId,
            eventId,
            CONTACT_VIEW,
            actorParticipantId,
            subjectParticipantId,
            channel,
            json.writeValueAsString(detail),
            clock.instant());
    if (rows != 1) {
      throw new IllegalStateException("privacy log was not stored");
    }
  }
}
