package app.scene.space.invitation;

import app.scene.common.audit.AuditActions;
import app.scene.common.audit.AuditLogRepository;
import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.invitation.InvitationAttempts;
import app.scene.common.invitation.InvitationTokens;
import app.scene.common.tenant.OperatorAccess;
import app.scene.common.tenant.SpaceMembership;
import app.scene.common.web.ItemPage;
import app.scene.common.web.PageRequest;
import app.scene.identity.OperatorAccountRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Space (organization) invitations (DEC-076, #361). The contract follows event invitations (DEC-060
 * and its 2026-11-16 Follow-up): hash-only token, 7-day TTL, one PENDING per space and email,
 * resend supersedes, the link is returned once by create and resend and is never stored, logged or
 * audited. Preview and accept use the same judgement order, error codes and attempt limit. Unlike
 * event invitations, commands write an audit row (#361); details carry ids and the role only.
 *
 * <p>Access order on the space path: no membership row is {@code 404 RESOURCE_NOT_FOUND}, a {@code
 * LEFT} row is {@code 403 NOT_A_MEMBER}, an active member who may not invite is {@code 403
 * FORBIDDEN}. Field validation comes after that. Inviting or touching an {@code ADMIN} invitation
 * needs an active space {@code OWNER}.
 */
@Service
public class SpaceInvitationService {

  public static final String MEMBER = "MEMBER";
  public static final String ADMIN = "ADMIN";

  private static final String PENDING = "PENDING";
  private static final String ACCEPTED = "ACCEPTED";
  private static final String REVOKED = "REVOKED";
  private static final String SUPERSEDED = "SUPERSEDED";
  private static final String ALREADY_ACCEPTED = "ALREADY_ACCEPTED";
  private static final String ALREADY_MEMBER = "ALREADY_MEMBER";
  private static final String ACTIVE = "ACTIVE";
  private static final String LEFT = "LEFT";

  private final SpaceInvitationRepository invitations;
  private final OperatorAccess access;
  private final OperatorAccountRepository accounts;
  private final InvitationAttempts attempts;
  private final AuditLogRepository auditLogs;
  private final JsonMapper json;
  private final Clock clock;

  public SpaceInvitationService(
      SpaceInvitationRepository invitations,
      OperatorAccess access,
      OperatorAccountRepository accounts,
      InvitationAttempts attempts,
      AuditLogRepository auditLogs,
      JsonMapper json,
      Clock clock) {
    this.invitations = invitations;
    this.access = access;
    this.accounts = accounts;
    this.attempts = attempts;
    this.auditLogs = auditLogs;
    this.json = json;
    this.clock = clock;
  }

  /** Pending invitations, newest first. Same access as the commands. */
  @Transactional(readOnly = true)
  public ItemPage<SpaceInvitationListItem> list(
      UUID actorId, UUID spaceId, Integer page, Integer size) {
    requireInviter(actorId, spaceId);
    PageRequest request = PageRequest.of(page, size);
    long total = invitations.countPending(spaceId);
    List<SpaceInvitationListItem> items = new ArrayList<>();
    for (SpaceInvitationRow row : invitations.listPending(spaceId, request)) {
      items.add(
          new SpaceInvitationListItem(
              row.id(), row.emailNormalized(), row.role(), row.status(), row.expiresAt()));
    }
    return ItemPage.of(items, request, total);
  }

  @Transactional
  public IssuedSpaceInvitation create(UUID actorId, UUID spaceId, JsonNode body) {
    SpaceMembership membership = requireInviter(actorId, spaceId);
    String email = requiredEmail(body);
    String role = requiredRole(body);
    requireMayInviteAs(membership, role);
    invitations.lockSpace(spaceId);
    IssuedSpaceInvitation issued = issue(spaceId, actorId, email, role);
    audit(
        spaceId,
        actorId,
        AuditActions.SPACE_INVITATION_CREATED,
        detail("invitationId", issued.id(), "role", role));
    return issued;
  }

  @Transactional
  public IssuedSpaceInvitation resend(UUID actorId, UUID spaceId, UUID invitationId) {
    SpaceMembership membership = requireInviter(actorId, spaceId);
    if (invitations.find(spaceId, invitationId).isEmpty()) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    invitations.lockSpace(spaceId);
    SpaceInvitationRow row =
        invitations
            .findForUpdate(spaceId, invitationId)
            .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
    requireMayInviteAs(membership, row.role());
    if (!PENDING.equals(row.status())) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "invitationId"));
    }
    IssuedSpaceInvitation issued = issue(spaceId, actorId, row.emailNormalized(), row.role());
    Map<String, Object> detail = detail("invitationId", issued.id(), "role", row.role());
    detail.put("previousInvitationId", row.id());
    audit(spaceId, actorId, AuditActions.SPACE_INVITATION_RESENT, detail);
    return issued;
  }

  @Transactional
  public SpaceInvitationResult revoke(UUID actorId, UUID spaceId, UUID invitationId) {
    SpaceMembership membership = requireInviter(actorId, spaceId);
    SpaceInvitationRow row =
        invitations
            .findForUpdate(spaceId, invitationId)
            .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
    requireMayInviteAs(membership, row.role());
    if (PENDING.equals(row.status())) {
      if (invitations.revokePending(spaceId, invitationId, clock.instant()) != 1) {
        throw new IllegalStateException("space invitation was not revoked");
      }
      audit(
          spaceId,
          actorId,
          AuditActions.SPACE_INVITATION_REVOKED,
          detail("invitationId", row.id(), "role", row.role()));
      return new SpaceInvitationResult(row.id(), row.role(), REVOKED, row.expiresAt());
    }
    if (REVOKED.equals(row.status())) {
      return new SpaceInvitationResult(row.id(), row.role(), REVOKED, row.expiresAt());
    }
    throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "invitationId"));
  }

  @Transactional(readOnly = true)
  public SpaceInvitationPreview preview(
      UUID actorId, String sessionEmail, String token, String remoteAddress) {
    attempts.acquire(actorId, remoteAddress);
    SpaceInvitationRow row = byToken(token);
    requireSameEmail(sessionEmail, row);
    String outcome = judged(row, actorId, clock.instant());
    if (PENDING.equals(outcome)
        && access.spaceMembership(actorId, row.spaceId()).kind() == SpaceMembership.Kind.ACTIVE) {
      outcome = ALREADY_MEMBER;
    }
    return new SpaceInvitationPreview(
        invitations.spaceName(row.spaceId()),
        row.role(),
        inviterName(row.invitedBy()),
        row.expiresAt(),
        outcome);
  }

  /**
   * Consumes the invitation and makes the session user an active member with the invited role. A
   * {@code LEFT} row comes back {@code ACTIVE} with that role. An active member keeps their role
   * and gets {@code ALREADY_MEMBER}; the invitation is still consumed. Event operator rows are not
   * touched (DEC-039).
   */
  @Transactional
  public SpaceInvitationAcceptance accept(
      UUID actorId, String sessionEmail, String token, String remoteAddress) {
    attempts.acquire(actorId, remoteAddress);
    SpaceInvitationRow seen = byToken(token);
    requireSameEmail(sessionEmail, seen);
    invitations.lockSpace(seen.spaceId());
    SpaceInvitationRow row =
        invitations
            .findForUpdate(seen.spaceId(), seen.id())
            .orElseThrow(() -> new SceneException(ErrorCode.INVITATION_NOT_FOUND));
    requireSameEmail(sessionEmail, row);
    Instant now = clock.instant();
    if (ALREADY_ACCEPTED.equals(judged(row, actorId, now))) {
      return new SpaceInvitationAcceptance(ALREADY_ACCEPTED, row.spaceId());
    }
    Optional<String> membership = invitations.membershipStatusForUpdate(row.spaceId(), actorId);
    if (invitations.acceptPending(row.spaceId(), row.id(), actorId, now) != 1) {
      throw new IllegalStateException("space invitation was not accepted");
    }
    String outcome = ACCEPTED;
    String change;
    if (membership.isEmpty()) {
      invitations.insertMember(row.spaceId(), actorId, row.role());
      change = "CREATED";
    } else if (LEFT.equals(membership.get())) {
      invitations.reactivateMember(row.spaceId(), actorId, row.role());
      change = "REACTIVATED";
    } else if (ACTIVE.equals(membership.get())) {
      outcome = ALREADY_MEMBER;
      change = "UNCHANGED";
    } else {
      throw new IllegalStateException("membership status is unknown");
    }
    Map<String, Object> detail = detail("invitationId", row.id(), "role", row.role());
    detail.put("outcome", outcome);
    detail.put("membership", change);
    audit(row.spaceId(), actorId, AuditActions.SPACE_INVITATION_ACCEPTED, detail);
    return new SpaceInvitationAcceptance(outcome, row.spaceId());
  }

  private IssuedSpaceInvitation issue(UUID spaceId, UUID actorId, String email, String role) {
    Instant now = clock.instant();
    invitations.supersedePending(spaceId, email, now);
    InvitationTokens.Issued issued = InvitationTokens.issue(InvitationTokens.SPACE_MARKER);
    UUID id = UUID.randomUUID();
    Instant expiresAt = now.plus(InvitationTokens.TTL);
    invitations.savePending(id, spaceId, email, role, issued.hash(), expiresAt, actorId, now);
    return new IssuedSpaceInvitation(id, role, PENDING, expiresAt, issued.link());
  }

  private SpaceMembership requireInviter(UUID actorId, UUID spaceId) {
    SpaceMembership membership = access.spaceMembership(actorId, spaceId);
    switch (membership.kind()) {
      case ABSENT -> throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
      case ENDED -> throw new SceneException(ErrorCode.NOT_A_MEMBER);
      case ACTIVE -> {}
    }
    if (!membership.mayInviteMembers()) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    return membership;
  }

  private static void requireMayInviteAs(SpaceMembership membership, String role) {
    if (ADMIN.equals(role) && !membership.mayInviteAsAdmin()) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
  }

  private SpaceInvitationRow byToken(String token) {
    String raw = token == null ? "" : token;
    if (!raw.startsWith(InvitationTokens.SPACE_MARKER)) {
      throw new SceneException(ErrorCode.INVITATION_NOT_FOUND);
    }
    return invitations
        .findByTokenHash(InvitationTokens.hash(raw))
        .orElseThrow(() -> new SceneException(ErrorCode.INVITATION_NOT_FOUND));
  }

  private static void requireSameEmail(String sessionEmail, SpaceInvitationRow row) {
    String email = normalize(sessionEmail);
    if (email == null) {
      throw new SceneException(ErrorCode.EMAIL_NOT_VERIFIED);
    }
    if (!email.equals(row.emailNormalized())) {
      throw new SceneException(ErrorCode.INVITATION_EMAIL_MISMATCH);
    }
  }

  /** Same order as event invitations, without the event lifecycle step. */
  private static String judged(SpaceInvitationRow row, UUID actorId, Instant now) {
    if (ACCEPTED.equals(row.status())) {
      if (actorId.equals(row.acceptedUserId())) {
        return ALREADY_ACCEPTED;
      }
      throw new SceneException(ErrorCode.INVITATION_ALREADY_ACCEPTED);
    }
    if (REVOKED.equals(row.status())) {
      throw new SceneException(ErrorCode.INVITATION_REVOKED);
    }
    if (SUPERSEDED.equals(row.status())) {
      throw new SceneException(ErrorCode.INVITATION_SUPERSEDED);
    }
    if (!PENDING.equals(row.status())) {
      throw new IllegalStateException("space invitation status is unknown");
    }
    if (row.expiresAt() == null || !row.expiresAt().isAfter(now)) {
      throw new SceneException(ErrorCode.INVITATION_EXPIRED);
    }
    return PENDING;
  }

  private String inviterName(UUID userId) {
    return accounts
        .findById(userId)
        .orElseThrow(() -> new IllegalStateException("inviter is missing"))
        .displayName();
  }

  private void audit(UUID spaceId, UUID actorId, String action, Map<String, Object> detail) {
    auditLogs.save(
        spaceId, null, actorId, action, json.writeValueAsString(detail), clock.instant());
  }

  private static Map<String, Object> detail(String k1, Object v1, String k2, Object v2) {
    Map<String, Object> detail = new LinkedHashMap<>();
    detail.put(k1, v1);
    detail.put(k2, v2);
    return detail;
  }

  private static String normalize(String raw) {
    if (raw == null) {
      return null;
    }
    String email = raw.trim().toLowerCase(Locale.ROOT);
    return email.isEmpty() ? null : email;
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

  /** Missing role is {@code MEMBER}: the January screen has no role choice (DEC-076). */
  private static String requiredRole(JsonNode body) {
    JsonNode node = body.get("role");
    if (node == null || node.isNull()) {
      return MEMBER;
    }
    if (!node.isString()) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "role"));
    }
    String role = node.asString();
    if (!MEMBER.equals(role) && !ADMIN.equals(role)) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "role"));
    }
    return role;
  }
}
