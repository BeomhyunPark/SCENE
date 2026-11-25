package app.scene.event.invitation;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.invitation.InvitationMail;
import app.scene.common.invitation.InvitationMailer;
import app.scene.common.invitation.InvitationTokens;
import app.scene.common.web.ItemPage;
import app.scene.common.web.PageRequest;
import app.scene.event.lifecycle.EventInvitationRepository;
import app.scene.event.lifecycle.EventLocation;
import app.scene.event.lifecycle.EventRepository;
import app.scene.event.lifecycle.EventRow;
import app.scene.event.lifecycle.InvitationRow;
import app.scene.event.permission.OperatorPermissionService;
import app.scene.identity.OperatorAccountRepository;
import app.scene.space.EventUserRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

/**
 * DEC-060 invitation commands. The document names no audit action for create, resend, revoke,
 * preview, or accept, so this service does not write one. Create and resend mail the link to the
 * invited address when the mail adapter is on (#470); otherwise they return the fragment link once
 * (DEC-060 Follow-up 2026-11-16). It is not stored, logged, or audited.
 */
@Service
public class EventInvitationService {

  /** One server constant. There is no per-space setting. */
  public static final Duration INVITATION_TTL = InvitationTokens.TTL;

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
  private final Clock clock;

  public EventInvitationService(
      EventRepository events,
      EventInvitationRepository invitations,
      EventUserRepository eventUsers,
      OperatorAccountRepository accounts,
      OperatorPermissionService permissions,
      InvitationMailer mailer,
      Clock clock) {
    this.events = events;
    this.invitations = invitations;
    this.eventUsers = eventUsers;
    this.accounts = accounts;
    this.permissions = permissions;
    this.mailer = mailer;
    this.clock = clock;
  }

  /** Pending invitations, newest first. Event owner only, like the commands. */
  @Transactional(readOnly = true)
  public ItemPage<InvitationListItem> list(UUID actorId, UUID eventId, Integer page, Integer size) {
    EventLocation location = location(eventId);
    permissions.requireEventOwner(actorId, location.spaceId(), eventId);
    PageRequest request = PageRequest.of(page, size);
    long total = invitations.countPending(location.spaceId(), eventId);
    List<InvitationListItem> items = new ArrayList<>();
    for (InvitationRow row : invitations.listPending(location.spaceId(), eventId, request)) {
      items.add(
          new InvitationListItem(
              row.id(), row.emailNormalized(), row.role(), row.status(), row.expiresAt()));
    }
    return ItemPage.of(items, request, total);
  }

  @Transactional
  public IssuedInvitation create(UUID actorId, UUID eventId, JsonNode body) {
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
  public IssuedInvitation resend(UUID actorId, UUID eventId, UUID invitationId) {
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
  public InvitationPreview preview(UUID actorId, String sessionEmail, String token) {
    InvitationRow row = byToken(token);
    requireSameEmail(sessionEmail, row);
    EventLocation event = location(row.eventId());
    String outcome = judged(row, event.lifecycleStatus(), actorId, clock.instant());
    return new InvitationPreview(
        row.eventId(),
        event.name(),
        row.role(),
        inviterName(row.invitedBy()),
        row.expiresAt(),
        outcome);
  }

  @Transactional
  public InvitationAcceptance accept(UUID actorId, String sessionEmail, String token) {
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
      return acceptance(ALREADY_ACCEPTED, row, actorId);
    }
    int updated = invitations.acceptPending(row.spaceId(), row.eventId(), row.id(), actorId, now);
    if (updated != 1) {
      InvitationRow again =
          invitations
              .findForUpdate(row.spaceId(), row.eventId(), row.id())
              .orElseThrow(() -> new SceneException(ErrorCode.INVITATION_NOT_FOUND));
      String retry = judged(again, locked.lifecycleStatus(), actorId, clock.instant());
      if (ALREADY_ACCEPTED.equals(retry)) {
        return acceptance(ALREADY_ACCEPTED, again, actorId);
      }
      throw new IllegalStateException("invitation was not accepted");
    }
    // An operator who is already on the event, such as a member who left the space but kept this
    // event (DEC-060), keeps the role they have. Role changes stay with the event owner (#387).
    if (eventUsers.findRole(row.spaceId(), row.eventId(), actorId).isEmpty()
        && eventUsers.save(row.spaceId(), row.eventId(), actorId, row.role()) != 1) {
      throw new IllegalStateException("operator was not added");
    }
    return acceptance("ACCEPTED", row, actorId);
  }

  /** The accepting user is the caller for both outcomes; ALREADY_ACCEPTED is the same person. */
  private InvitationAcceptance acceptance(String outcome, InvitationRow row, UUID actorId) {
    String role = eventUsers.findRole(row.spaceId(), row.eventId(), actorId).orElse(null);
    return new InvitationAcceptance(outcome, row.eventId(), role);
  }

  private IssuedInvitation issue(EventLocation location, UUID actorId, String email, String role) {
    Instant now = clock.instant();
    invitations.supersedePending(location.spaceId(), location.id(), email, now);
    InvitationTokens.Issued issued = InvitationTokens.issue("");
    UUID id = UUID.randomUUID();
    Instant expiresAt = now.plus(INVITATION_TTL);
    invitations.savePending(
        id, location.spaceId(), location.id(), email, role, issued.hash(), expiresAt, actorId, now);
    mailer.send(
        new InvitationMail(
            InvitationMail.Kind.EVENT,
            email,
            role,
            location.name(),
            inviterName(actorId),
            issued.link(),
            expiresAt));
    return new IssuedInvitation(
        id,
        role,
        PENDING,
        expiresAt,
        mailer.linkForResponse(issued.link()),
        mailer.delivery().name());
  }

  private InvitationRow byToken(String token) {
    String raw = token == null ? "" : token;
    return invitations
        .findByTokenHash(InvitationTokens.hash(raw))
        .orElseThrow(() -> new SceneException(ErrorCode.INVITATION_NOT_FOUND));
  }

  private static void requireSameEmail(String sessionEmail, InvitationRow row) {
    String email = normalize(sessionEmail);
    if (email == null) {
      throw new SceneException(ErrorCode.EMAIL_NOT_VERIFIED);
    }
    if (!email.equals(row.emailNormalized())) {
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
}
