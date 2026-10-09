package app.scene.event.participant;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.event.lifecycle.EventLocation;
import app.scene.event.lifecycle.EventRepository;
import app.scene.event.participant.param.ParticipantSessionInsert;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Issues a participant session from a stored access-key hash. The session lasts until logout. No
 * TTL is chosen. A key that does not match is {@code PARTICIPANT_ACCESS_INVALID}. There is no
 * revoked-key case. DEC-064 does not name a missing event, so that case follows the public
 * event-missing code.
 */
@Service
public class ParticipantSessionService {

  private static final int TOKEN_BYTES = 32;

  private final EventRepository events;
  private final ParticipantRepository participants;
  private final ParticipantSessionRepository sessions;
  private final Clock clock;
  private final JsonMapper json;
  private final SecureRandom random = new SecureRandom();

  public ParticipantSessionService(
      EventRepository events,
      ParticipantRepository participants,
      ParticipantSessionRepository sessions,
      Clock clock,
      JsonMapper json) {
    this.events = events;
    this.participants = participants;
    this.sessions = sessions;
    this.clock = clock;
    this.json = json;
  }

  /** Returns the raw session token. The caller sets the cookie and does not write the token. */
  @Transactional
  public String issue(UUID eventId, Supplier<String> body) {
    EventLocation location =
        events
            .findLocation(eventId)
            .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
    String accessKey = readKey(body.get());
    if (accessKey == null) {
      throw invalid();
    }
    List<ParticipantAccessMatch> matches =
        participants.findByKeyHash(location.spaceId(), eventId, Digests.sha256Hex(accessKey));
    if (matches.size() != 1) {
      throw invalid();
    }
    ParticipantAccessMatch access = matches.get(0);
    String token = newToken();
    sessions.save(
        ParticipantSessionInsert.of(
            UUID.randomUUID(),
            location.spaceId(),
            eventId,
            access.participantId(),
            access.id(),
            Digests.sha256Hex(token),
            clock.instant()));
    return token;
  }

  public Optional<ParticipantSelf> current(String rawToken) {
    if (rawToken == null || rawToken.isBlank()) {
      return Optional.empty();
    }
    return sessions.findByTokenHash(Digests.sha256Hex(rawToken));
  }

  /** A missing or unknown cookie deletes nothing. */
  @Transactional
  public void logout(String rawToken) {
    if (rawToken == null || rawToken.isBlank()) {
      return;
    }
    sessions.deleteByTokenHash(Digests.sha256Hex(rawToken));
  }

  private String readKey(String raw) {
    if (raw == null || raw.isBlank()) {
      return null;
    }
    JsonNode body;
    try {
      body = json.readTree(raw);
    } catch (RuntimeException exception) {
      return null;
    }
    if (body == null || !body.isObject()) {
      return null;
    }
    for (String name : body.propertyNames()) {
      if (!"accessKey".equals(name)) {
        return null;
      }
    }
    JsonNode key = body.get("accessKey");
    if (key == null || !key.isString()) {
      return null;
    }
    String trimmed = key.asString().strip();
    if (trimmed.isEmpty()) {
      return null;
    }
    return trimmed;
  }

  private String newToken() {
    byte[] bytes = new byte[TOKEN_BYTES];
    random.nextBytes(bytes);
    return HexFormat.of().formatHex(bytes);
  }

  private static SceneException invalid() {
    return new SceneException(ErrorCode.PARTICIPANT_ACCESS_INVALID);
  }
}
