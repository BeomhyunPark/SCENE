package app.scene.event.invitation;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.ratelimit.InMemoryRateLimiter;
import app.scene.event.lifecycle.EventInvitationRepository;
import app.scene.event.lifecycle.EventLocation;
import app.scene.event.lifecycle.EventRepository;
import app.scene.event.lifecycle.EventRow;
import app.scene.event.lifecycle.InvitationRow;
import app.scene.event.permission.OperatorPermissionService;
import app.scene.identity.OperatorAccountRepository;
import app.scene.space.EventUserRepository;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

/**
 * DEC-060 invitation commands. The document names no audit action for create, resend, revoke,
 * preview, or accept, so this service does not write one.
 */
@Service
public class EventInvitationService {

  /** One server constant. There is no per-space setting. */
  public static final Duration INVITATION_TTL = Duration.ofDays(7);

  /**
   * Provisional preview and accept limit. The document leaves the number undecided. One bucket is
   * shared by both commands, per account and per direct client address.
   */
  public static final int INVITATION_ATTEMPT_LIMIT = 5;

  public static final Duration INVITATION_ATTEMPT_WINDOW = Duration.ofHours(1);

  private static final String LINK_PREFIX = "/operator/invitations#";
  private static final String ARCHIVED = "ARCHIVED";
  private static final String PENDING = "PENDING";
  private static final String REVOKED = "REVOKED";
  private static final String ALREADY_ACCEPTED = "ALREADY_ACCEPTED";

  private final EventRepository events;
  private final EventInvitationRepository invitations;
  private final EventUserRepository eventUsers;
  private final OperatorAccountRepository accounts;
  private final OperatorPermissionService permissions;
  private final InvitationMailer mailer;
  private final InMemoryRateLimiter attempts;
  private final Clock clock;
  private final SecureRandom random = new SecureRandom();

  public EventInvitationService(
      EventRepository events,
      EventInvitationRepository invitations,
      EventUserRepository eventUsers,
      OperatorAccountRepository accounts,
      OperatorPermissionService permissions,
      InvitationMailer mailer,
      InMemoryRateLimiter attempts,
      Clock clock) {
    this.events = events;
    this.invitations = invitations;
    this.eventUsers = eventUsers;
    this.accounts = accounts;
    this.permissions = permissions;
    this.mailer = mailer;
    this.attempts = attempts;
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

  @Transactional(readOnly = true)
  public InvitationPreview preview(
      UUID actorId, String sessionEmail, String token, String remoteAddress) {
    limit(actorId, remoteAddress);
    InvitationRow row = byToken(token);
    requireSameEmail(sessionEmail, row);
    EventLocation event = location(row.eventId());
    String outcome = judged(row, event.lifecycleStatus(), actorId, clock.instant());
    return new InvitationPreview(
        event.name(), row.role(), inviterName(row.invitedBy()), row.expiresAt(), outcome);
  }

  @Transactional
  public InvitationAcceptance accept(
      UUID actorId, String sessionEmail, String token, String remoteAddress) {
    limit(actorId, remoteAddress);
    InvitationRow seen = byToken(token);
    requireSameEmail(sessionEmail, seen);
    EventRow locked = events.getForUpdate(seen.spaceId(), seen.eventId());
    InvitationRow row =
        invitations
            .findForUpdate(seen.spaceId(), seen.eventId(), seen.id())
            .orElseThrow(() -> new SceneException(ErrorCode.INVITATION_NOT_FOUND));
    requireSameEmail(sessionEmail, row);
    Instant now = clock.instant();
    String outcome = judged(row, locked.lifecycleStatus(), actorId, now);
    if (ALREADY_ACCEPTED.equals(outcome)) {
      return new InvitationAcceptance(ALREADY_ACCEPTED);
    }
    int updated = invitations.acceptPending(row.spaceId(), row.eventId(), row.id(), actorId, now);
    if (updated != 1) {
      InvitationRow again =
          invitations
              .findForUpdate(row.spaceId(), row.eventId(), row.id())
              .orElseThrow(() -> new SceneException(ErrorCode.INVITATION_NOT_FOUND));
      String retry = judged(again, locked.lifecycleStatus(), actorId, clock.instant());
      if (ALREADY_ACCEPTED.equals(retry)) {
        return new InvitationAcceptance(ALREADY_ACCEPTED);
      }
      throw new IllegalStateException("invitation was not accepted");
    }
    if (eventUsers.findRole(row.spaceId(), row.eventId(), actorId).isEmpty()
        && eventUsers.save(row.spaceId(), row.eventId(), actorId, row.role()) != 1) {
      throw new IllegalStateException("operator was not added");
    }
    return new InvitationAcceptance("ACCEPTED");
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
    return new Issued(InvitationTokens.hash(token), link);
  }

  private void limit(UUID actorId, String remoteAddress) {
    String address = remoteAddress == null || remoteAddress.isBlank() ? "unknown" : remoteAddress;
    int byAccount = attempts.acquire("invitation-account:" + actorId, INVITATION_ATTEMPT_WINDOW);
    int byAddress = attempts.acquire("invitation-ip:" + address, INVITATION_ATTEMPT_WINDOW);
    if (byAccount > INVITATION_ATTEMPT_LIMIT || byAddress > INVITATION_ATTEMPT_LIMIT) {
      throw new SceneException(ErrorCode.RATE_LIMITED);
    }
  }

  private InvitationRow byToken(String token) {
    String raw = token == null ? "" : token;
    return invitations
        .findByTokenHash(InvitationTokens.hash(raw))
        .orElseThrow(() -> new SceneException(ErrorCode.INVITATION_NOT_FOUND));
  }

  private static void requireSameEmail(String sessionEmail, InvitationRow row) {
    String email = normalize(sessionEmail);
    if (email == null || !email.equals(row.emailNormalized())) {
      throw new SceneException(ErrorCode.INVITATION_EMAIL_MISMATCH);
    }
  }

  private String judged(InvitationRow row, String lifecycle, UUID actorId, Instant now) {
    if ("ACCEPTED".equals(row.status())) {
      if (actorId.equals(row.acceptedUserId())) {
        return ALREADY_ACCEPTED;
      }
      throw new SceneException(ErrorCode.INVITATION_ALREADY_ACCEPTED);
    }
    if (REVOKED.equals(row.status())) {
      throw new SceneException(ErrorCode.INVITATION_REVOKED);
    }
    if ("SUPERSEDED".equals(row.status())) {
      throw new SceneException(ErrorCode.INVITATION_SUPERSEDED);
    }
    if (!PENDING.equals(row.status())) {
      throw new IllegalStateException("invitation status is unknown");
    }
    if (row.expiresAt() == null || !row.expiresAt().isAfter(now)) {
      throw new SceneException(ErrorCode.INVITATION_EXPIRED);
    }
    if (ARCHIVED.equals(lifecycle)) {
      throw new SceneException(ErrorCode.EVENT_ARCHIVED);
    }
    return PENDING;
  }

  private String inviterName(UUID userId) {
    return accounts
        .findById(userId)
        .orElseThrow(() -> new IllegalStateException("inviter is missing"))
        .displayName();
  }

  private static String normalize(String raw) {
    if (raw == null) {
      return null;
    }
    String email = raw.trim().toLowerCase(Locale.ROOT);
    return email.isEmpty() ? null : email;
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
