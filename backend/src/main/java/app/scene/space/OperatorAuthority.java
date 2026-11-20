package app.scene.space;

import java.util.UUID;

/**
 * One operator of an event with what decides one permission for them: the role, whether an OWNER's
 * handover has ended, and the stored override of that permission ({@code GRANT}, {@code REVOKE} or
 * null). The caller feeds these to {@code PermissionEvaluator.allows}. Having the {@code
 * event_users} row is what makes the person an active operator: operator removal and leaving the
 * space delete it ({@code MembershipLeaveService.revokeEventAccess}), and an event kept on leaving
 * keeps the row and its access, the same as {@code EventAccessGate}.
 */
public record OperatorAuthority(
    UUID userId, String role, boolean authorityEnded, String storedEffect) {}
