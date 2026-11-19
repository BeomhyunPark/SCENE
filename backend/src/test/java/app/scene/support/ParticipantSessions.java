package app.scene.support;

import app.scene.event.participant.Digests;
import jakarta.servlet.http.Cookie;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Opens a participant session row for a participant a test inserted by SQL. Sign-in with name,
 * phone and number is covered by {@code ParticipantSessionHttpIT}; other tests only need a cookie.
 */
public final class ParticipantSessions {

  public static final String COOKIE = "SCENE_PSESSION";

  private ParticipantSessions() {}

  public static Cookie open(JdbcTemplate jdbc, UUID spaceId, UUID eventId, UUID participantId) {
    String token = UUID.randomUUID().toString().replace("-", "") + "0".repeat(32);
    jdbc.update(
        """
        INSERT INTO participant_sessions (
          id, space_id, event_id, participant_id, token_hash, created_at)
        VALUES (?, ?, ?, ?, ?, now())
        """,
        UUID.randomUUID(),
        spaceId,
        eventId,
        participantId,
        Digests.sha256Hex(token));
    return new Cookie(COOKIE, token);
  }
}
