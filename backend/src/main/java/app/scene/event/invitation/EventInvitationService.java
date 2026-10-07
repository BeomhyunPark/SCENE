package app.scene.event.invitation;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.event.lifecycle.EventInvitationRepository;
import app.scene.event.lifecycle.EventLocation;
import app.scene.event.lifecycle.EventRepository;
import app.scene.event.lifecycle.EventRow;
import app.scene.event.lifecycle.InvitationRow;
import app.scene.event.permission.OperatorPermissionService;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

/**
 * DEC-060 invitation commands. The document names no audit action for create, resend, or revoke, so
 * this service does not write one. Preview and accept are a later slice.
 */
@Service
public class EventInvitationService {

  /** One server constant. There is no per-space setting. */
  public static final Duration INVITATION_TTL = Duration.ofDays(7);

  private static final String LINK_PREFIX = "/operator/invitations#";
  private static final String ARCHIVED = "ARCHIVED";
  private static final String PENDING = "PENDING";
  private static final String REVOKED = "REVOKED";

  private final EventRepository events;
  private final EventInvitationRepository invitations;
  private final OperatorPermissionService permissions;
  private final InvitationMailer mailer;
  private final Clock clock;
  private final SecureRandom random = new SecureRandom();

  public EventInvitationService(
      EventRepository events,
      EventInvitationRepository invitations,
      OperatorPermissionService permissions,
      InvitationMailer mailer,
      Clock clock) {
    this.events = events;
    this.invitations = invitations;
    this.permissions = permissions;
    this.mailer = mailer;
    this.clock = clock;
  }

  @Transactional
  public InvitationResult create(UUID actorId, UUID eventId, JsonNode body) {
    EventLocation location = location(eventId);
    permissions.requireEventOwner(actorId, location.spaceId(), eventId);
    String email = requiredEmail(body);
    String role = requiredRole(body);
    EventRow locked = events.getForUpdate(location.spaceId(), eventId);
    if (ARCHIVED.equals(locked.lifecycleStatus())) {
      throw new SceneException(ErrorCode.EVENT_ARCHIVED);
    }
    return issue(location, actorId, email, role);
  }

  @Transactional
  public InvitationResult resend(UUID actorId, UUID eventId, UUID invitationId) {
    EventLocation location = location(eventId);
    permissions.requireEventOwner(actorId, location.spaceId(), eventId);
    if (invitations.find(location.spaceId(), eventId, invitationId).isEmpty()) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    EventRow locked = events.getForUpdate(location.spaceId(), eventId);
    if (ARCHIVED.equals(locked.lifecycleStatus())) {
      throw new SceneException(ErrorCode.EVENT_ARCHIVED);
    }
    InvitationRow row =
        invitations
            .findForUpdate(location.spaceId(), eventId, invitationId)
            .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
    if (!PENDING.equals(row.status())) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "invitationId"));
    }
    return issue(location, actorId, row.emailNormalized(), row.role());
  }

  @Transactional
  public InvitationResult revoke(UUID actorId, UUID eventId, UUID invitationId) {
    EventLocation location = location(eventId);
    permissions.requireEventOwner(actorId, location.spaceId(), eventId);
    InvitationRow row =
        invitations
            .findForUpdate(location.spaceId(), eventId, invitationId)
            .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
    if (PENDING.equals(row.status())) {
      Instant now = clock.instant();
      if (invitations.revokePending(location.spaceId(), eventId, invitationId, now) != 1) {
        throw new IllegalStateException("invitation was not revoked");
      }
      return new InvitationResult(row.id(), row.role(), REVOKED, row.expiresAt());
    }
    if (REVOKED.equals(row.status())) {
      return new InvitationResult(row.id(), row.role(), REVOKED, row.expiresAt());
    }
    throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "invitationId"));
  }

  private InvitationResult issue(EventLocation location, UUID actorId, String email, String role) {
    Instant now = clock.instant();
    invitations.supersedePending(location.spaceId(), location.id(), email, now);
    Issued issued = issueToken();
    UUID id = UUID.randomUUID();
    Instant expiresAt = now.plus(INVITATION_TTL);
    invitations.savePending(
        id, location.spaceId(), location.id(), email, role, issued.hash(), expiresAt, actorId, now);
    mailer.send(new InvitationMail(email, role, location.name(), issued.link()));
    return new InvitationResult(id, role, PENDING, expiresAt);
  }

  private Issued issueToken() {
    byte[] bytes = new byte[32];
    random.nextBytes(bytes);
    String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    String link = LINK_PREFIX + token;
    if (link.indexOf('#') < 0
        || link.indexOf('?') >= 0
        || link.indexOf('#') != LINK_PREFIX.length() - 1) {
      throw new IllegalStateException("invitation link must keep the token in the fragment");
    }
    return new Issued(sha256(token), link);
  }

  private static String sha256(String token) {
    try {
      byte[] digest =
          MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(digest);
    } catch (NoSuchAlgorithmException ex) {
      throw new IllegalStateException("SHA-256 is unavailable", ex);
    }
  }

  private EventLocation location(UUID eventId) {
    return events
        .findLocation(eventId)
        .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
  }

  private static String requiredEmail(JsonNode body) {
    if (body == null || !body.isObject()) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "email"));
    }
    JsonNode node = body.get("email");
    if (node == null || !node.isString()) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "email"));
    }
    String email = node.asString().trim().toLowerCase(Locale.ROOT);
    int at = email.indexOf('@');
    if (at <= 0
        || at != email.lastIndexOf('@')
        || at == email.length() - 1
        || email.length() > 320
        || email.chars().anyMatch(Character::isWhitespace)) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "email"));
    }
    return email;
  }

  private static String requiredRole(JsonNode body) {
    if (body == null || !body.isObject()) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "role"));
    }
    JsonNode node = body.get("role");
    if (node == null || !node.isString()) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "role"));
    }
    String role = node.asString();
    if (!"MANAGER".equals(role) && !"STAFF".equals(role)) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "role"));
    }
    return role;
  }

  /** Hash and fragment link. The raw token is not retained. */
  private record Issued(String hash, String link) {}
}
