package app.scene.event.permission;

import app.scene.common.audit.AuditActions;
import app.scene.common.audit.AuditLogRepository;
import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.permission.Permission;
import app.scene.common.permission.PermissionEvaluator;
import app.scene.common.permission.RoleDefaults;
import app.scene.common.tenant.OperatorAccess;
import app.scene.common.tenant.SpaceMembership;
import app.scene.event.lifecycle.EventRepository;
import app.scene.event.lifecycle.EventRow;
import app.scene.space.EventUserPermissionRepository;
import app.scene.space.EventUserRepository;
import app.scene.space.MembershipLeaveService;
import app.scene.space.PermissionOverride;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/**
 * Per-person event permission overrides. The effective set is recomputed on every call. Only an
 * event owner whose handover is still open may change operators or overrides. A space owner may
 * read the rows. A space admin may not.
 */
@Service
public class OperatorPermissionService {

  private static final String GRANT = "GRANT";
  private static final String REVOKE = "REVOKE";
  private static final String ARCHIVED = "ARCHIVED";
  private static final String REMOVAL_REASON = "운영자 제거";

  private final EventRepository events;
  private final EventUserRepository eventUsers;
  private final EventUserPermissionRepository permissions;
  private final MembershipLeaveService leave;
  private final OperatorAccess access;
  private final AuditLogRepository auditLogs;
  private final JsonMapper json;
  private final Clock clock;

  public OperatorPermissionService(
      EventRepository events,
      EventUserRepository eventUsers,
      EventUserPermissionRepository permissions,
      MembershipLeaveService leave,
      OperatorAccess access,
      AuditLogRepository auditLogs,
      JsonMapper json,
      Clock clock) {
    this.events = events;
    this.eventUsers = eventUsers;
    this.permissions = permissions;
    this.leave = leave;
    this.access = access;
    this.auditLogs = auditLogs;
    this.json = json;
    this.clock = clock;
  }

  @Transactional(readOnly = true)
  public OperatorPermissions read(UUID actorId, UUID spaceId, UUID eventId, UUID targetUserId) {
    Gate gate = open(actorId, spaceId, eventId);
    if (!mayRead(gate, actorId, targetUserId)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    String role = eventUsers.findRole(spaceId, eventId, targetUserId).orElse(null);
    if (role == null) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    return view(spaceId, eventId, targetUserId, role);
  }

  @Transactional
  public OperatorPermissions replace(
      UUID actorId,
      UUID spaceId,
      UUID eventId,
      UUID targetUserId,
      List<String> grants,
      List<String> revokes) {
    Gate gate = open(actorId, spaceId, eventId);
    if (!mayChange(gate)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    if (eventUsers.findRole(spaceId, eventId, targetUserId).isEmpty()) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    List<Permission> grantKeys = validated(grants, revokes);
    List<Permission> revokeKeys = parsed(revokes);
    EventRow locked = events.getForUpdate(spaceId, eventId);
    String role = eventUsers.findRoleForUpdate(spaceId, eventId, targetUserId).orElse(null);
    if (role == null) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    List<PermissionOverride> stored = permissions.findAll(spaceId, eventId, targetUserId);
    if (ARCHIVED.equals(locked.lifecycleStatus()) && widens(stored, grantKeys, revokeKeys)) {
      throw new SceneException(ErrorCode.EVENT_ARCHIVED);
    }
    rejectRules(role, grantKeys, revokeKeys);
    Map<Permission, String> desired = normalize(role, grantKeys, revokeKeys);
    if (same(stored, desired)) {
      return view(spaceId, eventId, targetUserId, role);
    }
    List<String> grantsBefore = effects(stored, GRANT);
    List<String> revokesBefore = effects(stored, REVOKE);
    apply(spaceId, eventId, targetUserId, actorId, stored, desired);
    List<String> grantsAfter = names(grantsOf(desired));
    List<String> revokesAfter = names(revokesOf(desired));
    audit(
        spaceId,
        eventId,
        actorId,
        AuditActions.EVENT_USER_PERMISSIONS_REPLACED,
        replacedDetail(targetUserId, grantsBefore, revokesBefore, grantsAfter, revokesAfter),
        clock.instant());
    return view(spaceId, eventId, targetUserId, role);
  }

  @Transactional
  public OperatorPermissions changeRole(
      UUID actorId, UUID spaceId, UUID eventId, UUID targetUserId, String role) {
    Gate gate = open(actorId, spaceId, eventId);
    if (!mayChange(gate)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    String current = eventUsers.findRole(spaceId, eventId, targetUserId).orElse(null);
    if (current == null) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    if (!"MANAGER".equals(role) && !"STAFF".equals(role)) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "role"));
    }
    EventRow locked = events.getForUpdate(spaceId, eventId);
    String lockedRole = eventUsers.findRoleForUpdate(spaceId, eventId, targetUserId).orElse(null);
    if (lockedRole == null) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    if (ARCHIVED.equals(locked.lifecycleStatus())) {
      throw new SceneException(ErrorCode.EVENT_ARCHIVED);
    }
    String snapshot = permissions.findSnapshot(spaceId, eventId, targetUserId);
    permissions.delete(spaceId, eventId, targetUserId);
    if (eventUsers.updateRole(spaceId, eventId, targetUserId, role) != 1) {
      throw new IllegalStateException("event operator role was not updated");
    }
    Map<String, Object> detail = new LinkedHashMap<>();
    detail.put("userId", targetUserId);
    detail.put("roleBefore", lockedRole);
    detail.put("roleAfter", role);
    detail.put("deletedOverrides", json.readTree(snapshot));
    audit(spaceId, eventId, actorId, AuditActions.EVENT_USER_ROLE_CHANGED, detail, clock.instant());
    return view(spaceId, eventId, targetUserId, role);
  }

  @Transactional
  public void remove(UUID actorId, UUID spaceId, UUID eventId, UUID targetUserId) {
    Gate gate = open(actorId, spaceId, eventId);
    if (!mayChange(gate)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    if (eventUsers.findRole(spaceId, eventId, targetUserId).isEmpty()) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    if (eventUsers.findRoleForUpdate(spaceId, eventId, targetUserId).isEmpty()) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    leave.revokeEventAccess(spaceId, eventId, targetUserId, actorId, REMOVAL_REASON);
  }

  /** Adds an operator with no overrides. A removed operator's old overrides stay gone. */
  @Transactional
  public OperatorPermissions add(
      UUID actorId, UUID spaceId, UUID eventId, UUID targetUserId, String role) {
    Gate gate = open(actorId, spaceId, eventId);
    if (!mayChange(gate)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    if (!"MANAGER".equals(role) && !"STAFF".equals(role)) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "role"));
    }
    EventRow locked = events.getForUpdate(spaceId, eventId);
    if (ARCHIVED.equals(locked.lifecycleStatus())) {
      throw new SceneException(ErrorCode.EVENT_ARCHIVED);
    }
    if (eventUsers.findRole(spaceId, eventId, targetUserId).isPresent()) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "userId"));
    }
    if (eventUsers.save(spaceId, eventId, targetUserId, role) != 1) {
      throw new IllegalStateException("event operator was not added");
    }
    return view(spaceId, eventId, targetUserId, role);
  }

  private Gate open(UUID actorId, UUID spaceId, UUID eventId) {
    if (events.find(spaceId, eventId).isEmpty()) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    String eventRole = eventUsers.findRole(spaceId, eventId, actorId).orElse(null);
    if (eventRole == null && access.eventAccessRevoked(actorId, spaceId, eventId)) {
      throw new SceneException(ErrorCode.NOT_A_MEMBER);
    }
    SpaceMembership membership = access.spaceMembership(actorId, spaceId);
    if (eventRole == null) {
      if (membership.kind() == SpaceMembership.Kind.ENDED) {
        throw new SceneException(ErrorCode.NOT_A_MEMBER);
      }
      if (membership.kind() != SpaceMembership.Kind.ACTIVE) {
        throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
      }
    }
    boolean authorityEnded =
        eventRole != null && eventUsers.existsAuthorityEnded(spaceId, eventId, actorId);
    return new Gate(eventRole, authorityEnded, membership);
  }

  private static boolean mayChange(Gate gate) {
    return gate.eventRole() != null
        && PermissionEvaluator.allows(
            Permission.EVENT_USER_MANAGE, gate.eventRole(), gate.authorityEnded(), null);
  }

  private static boolean mayRead(Gate gate, UUID actorId, UUID targetUserId) {
    if (mayChange(gate)) {
      return true;
    }
    if (gate.eventRole() != null && actorId.equals(targetUserId)) {
      return true;
    }
    return gate.membership().mayReadEventPermissions();
  }

  private OperatorPermissions view(UUID spaceId, UUID eventId, UUID userId, String role) {
    List<PermissionOverride> stored = permissions.findAll(spaceId, eventId, userId);
    boolean authorityEnded = eventUsers.existsAuthorityEnded(spaceId, eventId, userId);
    Map<Permission, String> effects = new HashMap<>();
    for (PermissionOverride row : stored) {
      Permission.find(row.permission())
          .ifPresent(permission -> effects.put(permission, row.effect()));
    }
    return new OperatorPermissions(
        userId,
        role,
        names(RoleDefaults.of(role)),
        effects(stored, GRANT),
        effects(stored, REVOKE),
        names(PermissionEvaluator.effective(role, authorityEnded, effects)));
  }

  private void apply(
      UUID spaceId,
      UUID eventId,
      UUID userId,
      UUID actorId,
      List<PermissionOverride> stored,
      Map<Permission, String> desired) {
    Map<String, PermissionOverride> byName = new HashMap<>();
    for (PermissionOverride row : stored) {
      byName.put(row.permission(), row);
    }
    for (PermissionOverride row : stored) {
      Permission parsed = Permission.find(row.permission()).orElse(null);
      if (parsed == null || !desired.containsKey(parsed)) {
        if (permissions.deleteOne(spaceId, eventId, userId, row.permission()) != 1) {
          throw new IllegalStateException("permission override was not deleted");
        }
      }
    }
    Instant now = clock.instant();
    for (Map.Entry<Permission, String> entry : desired.entrySet()) {
      PermissionOverride existing = byName.get(entry.getKey().name());
      if (existing == null) {
        if (permissions.save(
                spaceId, eventId, userId, entry.getKey().name(), entry.getValue(), actorId, now)
            != 1) {
          throw new IllegalStateException("permission override was not saved");
        }
      } else if (!existing.effect().equals(entry.getValue())) {
        if (permissions.update(
                spaceId, eventId, userId, entry.getKey().name(), entry.getValue(), actorId, now)
            != 1) {
          throw new IllegalStateException("permission override was not updated");
        }
      }
    }
  }

  private void audit(
      UUID spaceId,
      UUID eventId,
      UUID actorId,
      String action,
      Map<String, Object> detail,
      Instant occurredAt) {
    auditLogs.save(spaceId, eventId, actorId, action, json.writeValueAsString(detail), occurredAt);
  }

  private List<Permission> validated(List<String> grants, List<String> revokes) {
    if (grants == null || revokes == null) {
      throw new SceneException(
          ErrorCode.VALIDATION_FAILED, Map.of("field", grants == null ? "grants" : "revokes"));
    }
    List<Map<String, String>> errors = new ArrayList<>();
    Set<String> seen = new HashSet<>();
    collect(grants, "grants", seen, errors);
    collect(revokes, "revokes", seen, errors);
    if (!errors.isEmpty()) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("errors", errors));
    }
    return parsed(grants);
  }

  private static void collect(
      List<String> keys, String field, Set<String> seen, List<Map<String, String>> errors) {
    Set<String> within = new HashSet<>();
    for (String key : keys) {
      if (Permission.find(key).isEmpty()) {
        errors.add(Map.of("field", field, "code", "UNKNOWN_PERMISSION"));
        continue;
      }
      if (!within.add(key) || !seen.add(key)) {
        errors.add(Map.of("field", field, "code", "DUPLICATE_PERMISSION"));
      }
    }
  }

  private static List<Permission> parsed(List<String> keys) {
    List<Permission> parsed = new ArrayList<>();
    for (String key : keys) {
      parsed.add(Permission.find(key).orElseThrow());
    }
    return parsed;
  }

  private static void rejectRules(String role, List<Permission> grants, List<Permission> revokes) {
    if ("OWNER".equals(role)) {
      throw new SceneException(ErrorCode.PERMISSION_OWNER_NOT_OVERRIDABLE);
    }
    if (grants.stream().anyMatch(Permission::ownerOnly)) {
      throw new SceneException(ErrorCode.PERMISSION_OWNER_ONLY);
    }
    if (revokes.stream().anyMatch(permission -> !permission.revocable())) {
      throw new SceneException(ErrorCode.PERMISSION_NOT_OVERRIDABLE);
    }
  }

  private static boolean widens(
      List<PermissionOverride> stored, List<Permission> grants, List<Permission> revokes) {
    Set<String> storedGrants = new HashSet<>();
    Set<String> storedRevokes = new HashSet<>();
    for (PermissionOverride row : stored) {
      if (GRANT.equals(row.effect())) {
        storedGrants.add(row.permission());
      } else if (REVOKE.equals(row.effect())) {
        storedRevokes.add(row.permission());
      }
    }
    for (Permission grant : grants) {
      if (!storedGrants.contains(grant.name())) {
        return true;
      }
    }
    Set<String> requestedRevokes = new HashSet<>();
    for (Permission revoke : revokes) {
      requestedRevokes.add(revoke.name());
    }
    for (String storedRevoke : storedRevokes) {
      if (!requestedRevokes.contains(storedRevoke)) {
        return true;
      }
    }
    return false;
  }

  private static Map<Permission, String> normalize(
      String role, List<Permission> grants, List<Permission> revokes) {
    Set<Permission> defaults = RoleDefaults.of(role);
    Map<Permission, String> desired = new LinkedHashMap<>();
    grants.stream()
        .filter(permission -> !defaults.contains(permission))
        .sorted(Comparator.comparing(Permission::name))
        .forEach(permission -> desired.put(permission, GRANT));
    revokes.stream()
        .filter(defaults::contains)
        .sorted(Comparator.comparing(Permission::name))
        .forEach(permission -> desired.put(permission, REVOKE));
    return desired;
  }

  private static boolean same(List<PermissionOverride> stored, Map<Permission, String> desired) {
    if (stored.size() != desired.size()) {
      return false;
    }
    for (PermissionOverride row : stored) {
      Permission permission = Permission.find(row.permission()).orElse(null);
      if (permission == null || !row.effect().equals(desired.get(permission))) {
        return false;
      }
    }
    return true;
  }

  private static List<Permission> grantsOf(Map<Permission, String> desired) {
    return desired.entrySet().stream()
        .filter(entry -> GRANT.equals(entry.getValue()))
        .map(Map.Entry::getKey)
        .toList();
  }

  private static List<Permission> revokesOf(Map<Permission, String> desired) {
    return desired.entrySet().stream()
        .filter(entry -> REVOKE.equals(entry.getValue()))
        .map(Map.Entry::getKey)
        .toList();
  }

  private static List<String> effects(List<PermissionOverride> stored, String effect) {
    return stored.stream()
        .filter(row -> effect.equals(row.effect()))
        .map(PermissionOverride::permission)
        .sorted()
        .toList();
  }

  private static List<String> names(Iterable<Permission> permissions) {
    List<String> names = new ArrayList<>();
    for (Permission permission : permissions) {
      names.add(permission.name());
    }
    names.sort(Comparator.naturalOrder());
    return List.copyOf(names);
  }

  private static Map<String, Object> replacedDetail(
      UUID userId,
      List<String> grantsBefore,
      List<String> revokesBefore,
      List<String> grantsAfter,
      List<String> revokesAfter) {
    Map<String, Object> detail = new LinkedHashMap<>();
    detail.put("userId", userId);
    detail.put("grantsBefore", grantsBefore);
    detail.put("revokesBefore", revokesBefore);
    detail.put("grantsAfter", grantsAfter);
    detail.put("revokesAfter", revokesAfter);
    return detail;
  }

  private record Gate(String eventRole, boolean authorityEnded, SpaceMembership membership) {}
}
