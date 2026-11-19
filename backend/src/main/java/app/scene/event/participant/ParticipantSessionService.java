package app.scene.event.participant;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.event.lifecycle.EventLocation;
import app.scene.event.lifecycle.EventRepository;
import app.scene.event.participant.param.ParticipantSessionInsert;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

/**
 * Participant sessions (DEC-078 §3). A participant signs in with name, phone and the six-digit
 * number they chose. Any wrong part, and a phone with no application, is the same {@code
 * PARTICIPANT_LOGIN_FAILED}. {@link ParticipantGuard} locks a phone after consecutive failures and
 * limits failing addresses. A session ends at logout, at a number reset, or after the event's end
 * limit. The number never leaves this class except as a bcrypt hash.
 */
@Service
public class ParticipantSessionService {

  private static final int TOKEN_BYTES = 32;
  private static final Set<String> SIGN_IN_KEYS = Set.of("name", "phone", "pin");
  private static final Set<String> PIN_KEYS = Set.of("currentPin", "newPin");

  private final EventRepository events;
  private final ParticipantRepository participants;
  private final ParticipantSessionRepository sessions;
  private final ParticipantPins pins;
  private final ParticipantGuard guard;
  private final ParticipantProperties properties;
  private final Clock clock;
  private final SecureRandom random = new SecureRandom();

  public ParticipantSessionService(
      EventRepository events,
      ParticipantRepository participants,
      ParticipantSessionRepository sessions,
      ParticipantPins pins,
      ParticipantGuard guard,
      ParticipantProperties properties,
      Clock clock) {
    this.properties = properties;
    this.events = events;
    this.participants = participants;
    this.sessions = sessions;
    this.pins = pins;
    this.guard = guard;
    this.clock = clock;
  }

  /**
   * A raw session token and how long its cookie should live: until the server-side end of the
   * session (DEC-078 §3), so a phone keeps the session after the browser closes. The caller sets
   * the cookie and does not log the token.
   */
  public record Issued(String token, Duration maxAge) {}

  /** Signs in. Returns the raw session token and the cookie lifetime. */
  @Transactional
  public Issued signIn(UUID eventId, JsonNode body, String address) {
    EventLocation location =
        events
            .findLocation(eventId)
            .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
    String name = text(body, "name", SIGN_IN_KEYS);
    String phone = text(body, "phone", SIGN_IN_KEYS);
    String pin = text(body, "pin", SIGN_IN_KEYS);
    guard.requireAddressOpen(eventId, address);
    String phoneKey = ParticipantPins.phoneKey(phone);
    guard.requirePhoneOpen(eventId, phoneKey);
    Optional<ParticipantIdentity> found =
        participants.findByPhoneKey(location.spaceId(), eventId, phoneKey);
    ParticipantIdentity participant = found.orElse(null);
    boolean pinMatches = pins.matches(pin, participant == null ? null : participant.pinHash());
    boolean ok =
        participant != null
            && pinMatches
            && participant.applicationId() != null
            && ParticipantPins.normalizeName(participant.name())
                .equals(ParticipantPins.normalizeName(name));
    if (!ok) {
      guard.failed(eventId, phoneKey, address);
      throw new SceneException(ErrorCode.PARTICIPANT_LOGIN_FAILED);
    }
    guard.succeeded(eventId, phoneKey);
    return open(location.spaceId(), eventId, participant.id());
  }

  /** Opens a session for a participant already checked by the caller. */
  @Transactional
  public Issued open(UUID spaceId, UUID eventId, UUID participantId) {
    String token = newToken();
    sessions.save(
        ParticipantSessionInsert.of(
            UUID.randomUUID(),
            spaceId,
            eventId,
            participantId,
            null,
            Digests.sha256Hex(token),
            clock.instant()));
    return new Issued(token, cookieMaxAge(spaceId, eventId));
  }

  /** Until midnight ({@code zone}) of end date + 1 + days; a fixed lifetime with no end date. */
  private Duration cookieMaxAge(UUID spaceId, UUID eventId) {
    LocalDate end = sessions.findEventEndDate(spaceId, eventId);
    if (end == null) {
      return properties.cookieMaxAgeWithoutEnd();
    }
    Instant until =
        end.plusDays(1L + properties.sessionDaysAfterEnd())
            .atStartOfDay(ZoneId.of(properties.zone()))
            .toInstant();
    Duration left = Duration.between(clock.instant(), until);
    return left.isNegative() ? Duration.ZERO : left;
  }

  /**
   * Sets a new number. A temporary-number session needs no {@code currentPin}; others must give it,
   * and a wrong one counts as a failure for the phone. Other sessions of the participant end.
   */
  @Transactional
  public void changePin(ParticipantSelf self, String rawToken, JsonNode body, String address) {
    ParticipantIdentity participant =
        participants
            .findById(self.spaceId(), self.eventId(), self.participantId())
            .orElseThrow(() -> new SceneException(ErrorCode.AUTHENTICATION_REQUIRED));
    String newPin = text(body, "newPin", PIN_KEYS);
    String phoneKey = ParticipantPins.phoneKey(participant.phone());
    if (!participant.pinTemporary()) {
      String current = text(body, "currentPin", PIN_KEYS);
      guard.requireAddressOpen(self.eventId(), address);
      guard.requirePhoneOpen(self.eventId(), phoneKey);
      if (!pins.matches(current, participant.pinHash())) {
        guard.failed(self.eventId(), phoneKey, address);
        throw new SceneException(ErrorCode.PARTICIPANT_LOGIN_FAILED);
      }
    } else if (body != null && body.has("currentPin") && !body.get("currentPin").isString()) {
      throw field("currentPin");
    }
    ParticipantPins.requireAccepted(newPin, ParticipantPins.digits(participant.phone()));
    participants.updatePin(
        self.spaceId(),
        self.eventId(),
        self.participantId(),
        pins.hash(newPin),
        false,
        clock.instant());
    guard.succeeded(self.eventId(), phoneKey);
    sessions.deleteByParticipant(
        self.spaceId(), self.eventId(), self.participantId(), Digests.sha256Hex(rawToken));
  }

  public Optional<ParticipantSelf> current(String rawToken) {
    if (rawToken == null || rawToken.isBlank()) {
      return Optional.empty();
    }
    return sessions.findByTokenHash(Digests.sha256Hex(rawToken), clock.instant());
  }

  /** A missing or unknown cookie deletes nothing. */
  @Transactional
  public void logout(String rawToken) {
    if (rawToken == null || rawToken.isBlank()) {
      return;
    }
    sessions.deleteByTokenHash(Digests.sha256Hex(rawToken));
  }

  /** A required string from an object body with only {@code allowed} keys. */
  private static String text(JsonNode body, String name, Set<String> allowed) {
    if (body == null || !body.isObject()) {
      throw field(name);
    }
    for (String key : body.propertyNames()) {
      if (!allowed.contains(key)) {
        throw field(key);
      }
    }
    JsonNode value = body.get(name);
    if (value == null || !value.isString()) {
      throw field(name);
    }
    return value.asString().strip();
  }

  private String newToken() {
    byte[] bytes = new byte[TOKEN_BYTES];
    random.nextBytes(bytes);
    return HexFormat.of().formatHex(bytes);
  }

  private static SceneException field(String name) {
    return new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", name));
  }
}
