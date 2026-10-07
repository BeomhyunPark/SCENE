package app.scene.event.permission;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.tenant.SpaceMembership;
import app.scene.support.PostgresTestcontainer;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/** P0-11 permission overrides. Persistence uses the Testcontainers database. */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class OperatorPermissionIT {

  @Autowired OperatorPermissionService permissions;
  @Autowired JdbcTemplate jdbc;

  @Test
  void ownerTargetAndOwnerOnlyGrantAreRejected() {
    Fixture fx = seed("ACTIVE");
    assertCode(
        ErrorCode.PERMISSION_OWNER_NOT_OVERRIDABLE,
        () ->
            permissions.replace(
                fx.ownerId,
                fx.spaceId,
                fx.eventId,
                fx.ownerId,
                List.of("EVENT_LIFECYCLE"),
                List.of("EVENT_READ")));
    assertCode(
        ErrorCode.PERMISSION_OWNER_ONLY,
        () ->
            permissions.replace(
                fx.ownerId,
                fx.spaceId,
                fx.eventId,
                fx.staffId,
                List.of("EVENT_USER_MANAGE"),
                List.of("EVENT_READ")));
    assertCode(
        ErrorCode.PERMISSION_OWNER_ONLY,
        () ->
            permissions.replace(
                fx.ownerId,
                fx.spaceId,
                fx.eventId,
                fx.managerId,
                List.of("EVENT_LIFECYCLE"),
                List.of()));
    assertThat(overrideCount(fx.eventId, fx.staffId)).isZero();
    assertThat(overrideCount(fx.eventId, fx.ownerId)).isZero();
    assertThat(auditCount(fx, OperatorPermissionService.PERMISSIONS_REPLACED)).isZero();
  }

  @Test
  void spaceOwnerMayReadAndMayNotChangeAndSpaceAdminMayNotRead() {
    Fixture fx = seed("ACTIVE");
    UUID spaceOwnerId = user("Space owner");
    UUID spaceAdminId = user("Space admin");
    member(fx.spaceId, spaceOwnerId, "OWNER");
    member(fx.spaceId, spaceAdminId, "ADMIN");
    permissions.replace(
        fx.ownerId, fx.spaceId, fx.eventId, fx.staffId, List.of("DATA_EXPORT"), List.of());

    OperatorPermissions read = permissions.read(spaceOwnerId, fx.spaceId, fx.eventId, fx.staffId);
    assertThat(read.grants()).containsExactly("DATA_EXPORT");
    assertThat(read.effective()).contains("DATA_EXPORT", "EVENT_READ");
    assertCode(
        ErrorCode.FORBIDDEN,
        () ->
            permissions.replace(
                spaceOwnerId, fx.spaceId, fx.eventId, fx.staffId, List.of(), List.of()));
    assertCode(
        ErrorCode.FORBIDDEN,
        () -> permissions.read(spaceAdminId, fx.spaceId, fx.eventId, fx.staffId));
    assertThat(overrideCount(fx.eventId, fx.staffId)).isEqualTo(1);
    assertThat(SpaceMembership.active("OWNER").mayReadEventPermissions()).isTrue();
    assertThat(SpaceMembership.active("ADMIN").mayReadEventPermissions()).isFalse();
    assertThat(SpaceMembership.active("OWNER").mayChangeEventOperators()).isFalse();
  }

  @Test
  void judgmentOrderStopsAtTheFirstMatch() {
    Fixture fx = seed("ACTIVE");
    UUID missingEvent = UUID.randomUUID();
    assertCode(
        ErrorCode.RESOURCE_NOT_FOUND,
        () -> permissions.read(fx.ownerId, fx.spaceId, missingEvent, fx.staffId));
    permissions.remove(fx.ownerId, fx.spaceId, fx.eventId, fx.staffId);
    assertCode(
        ErrorCode.NOT_A_MEMBER,
        () ->
            permissions.replace(
                fx.staffId, fx.spaceId, fx.eventId, fx.managerId, List.of("NOT_A_KEY"), List.of()));
    Fixture other = seed("ACTIVE");
    assertCode(
        ErrorCode.FORBIDDEN,
        () ->
            permissions.replace(
                other.staffId,
                other.spaceId,
                other.eventId,
                UUID.randomUUID(),
                List.of("NOT_A_KEY"),
                List.of()));
    assertCode(
        ErrorCode.RESOURCE_NOT_FOUND,
        () ->
            permissions.replace(
                other.ownerId,
                other.spaceId,
                other.eventId,
                UUID.randomUUID(),
                List.of("NOT_A_KEY"),
                List.of()));
  }

  @Test
  void archivedAllowsNarrowingAndRejectsWidening() {
    Fixture fx = seed("ACTIVE");
    permissions.replace(
        fx.ownerId, fx.spaceId, fx.eventId, fx.staffId, List.of("DATA_EXPORT"), List.of());
    jdbc.update("UPDATE events SET lifecycle_status = 'ARCHIVED' WHERE id = ?", fx.eventId);

    OperatorPermissions narrowed =
        permissions.replace(fx.ownerId, fx.spaceId, fx.eventId, fx.staffId, List.of(), List.of());
    assertThat(narrowed.grants()).isEmpty();
    assertThat(overrideCount(fx.eventId, fx.staffId)).isZero();

    assertCode(
        ErrorCode.EVENT_ARCHIVED,
        () ->
            permissions.replace(
                fx.ownerId, fx.spaceId, fx.eventId, fx.staffId, List.of("DATA_EXPORT"), List.of()));
    assertThat(overrideCount(fx.eventId, fx.staffId)).isZero();
    assertCode(
        ErrorCode.EVENT_ARCHIVED,
        () -> permissions.changeRole(fx.ownerId, fx.spaceId, fx.eventId, fx.managerId, "STAFF"));
    assertThat(role(fx.eventId, fx.managerId)).isEqualTo("MANAGER");
    assertThat(auditCount(fx, OperatorPermissionService.ROLE_CHANGED)).isZero();
  }

  @Test
  void endedAllowsAGrant() {
    Fixture fx = seed("ENDED");
    OperatorPermissions granted =
        permissions.replace(
            fx.ownerId, fx.spaceId, fx.eventId, fx.staffId, List.of("DATA_EXPORT"), List.of());
    assertThat(granted.grants()).containsExactly("DATA_EXPORT");
    assertThat(granted.effective()).contains("DATA_EXPORT");
  }

  @Test
  void roleChangeClearsOverridesAndReAddDoesNotRestoreThem() {
    Fixture fx = seed("ACTIVE");
    permissions.replace(
        fx.ownerId, fx.spaceId, fx.eventId, fx.managerId, List.of("DATA_EXPORT"), List.of());
    OperatorPermissions changed =
        permissions.changeRole(fx.ownerId, fx.spaceId, fx.eventId, fx.managerId, "STAFF");
    assertThat(changed.role()).isEqualTo("STAFF");
    assertThat(changed.grants()).isEmpty();
    assertThat(changed.effective()).contains("EVENT_READ").doesNotContain("DATA_EXPORT");
    assertThat(auditDetail(fx, OperatorPermissionService.ROLE_CHANGED)).contains("DATA_EXPORT");

    permissions.remove(fx.ownerId, fx.spaceId, fx.eventId, fx.managerId);
    OperatorPermissions added =
        permissions.add(fx.ownerId, fx.spaceId, fx.eventId, fx.managerId, "MANAGER");
    assertThat(added.role()).isEqualTo("MANAGER");
    assertThat(added.grants()).isEmpty();
    assertThat(added.revokes()).isEmpty();
    assertThat(overrideCount(fx.eventId, fx.managerId)).isZero();
    assertThat(added.effective())
        .contains("TASK_WRITE", "EVENT_READ")
        .doesNotContain("DATA_EXPORT");
  }

  @Test
  void repeatedReplaceKeepsGrantedAtAndSkipsAudit() {
    Fixture fx = seed("ACTIVE");
    permissions.replace(
        fx.ownerId, fx.spaceId, fx.eventId, fx.staffId, List.of("DATA_EXPORT"), List.of());
    jdbc.update(
        """
        UPDATE event_user_permissions
        SET granted_at = timestamptz '2020-01-01T00:00:00Z'
        WHERE event_id = ? AND user_id = ?
        """,
        fx.eventId,
        fx.staffId);
    permissions.replace(
        fx.ownerId, fx.spaceId, fx.eventId, fx.staffId, List.of("DATA_EXPORT"), List.of());
    assertThat(grantedAt(fx.eventId, fx.staffId)).startsWith("2020-01-01");
    assertThat(auditCount(fx, OperatorPermissionService.PERMISSIONS_REPLACED)).isEqualTo(1);
  }

  @Test
  void unknownAndDuplicateKeysFailTogetherAndEventReadGrantIsNotStored() {
    Fixture fx = seed("ACTIVE");
    assertThatThrownBy(
            () ->
                permissions.replace(
                    fx.ownerId,
                    fx.spaceId,
                    fx.eventId,
                    fx.staffId,
                    List.of("MEMBER_MANAGE", "DATA_EXPORT"),
                    List.of("DATA_EXPORT")))
        .isInstanceOf(SceneException.class)
        .satisfies(
            thrown -> {
              SceneException scene = (SceneException) thrown;
              assertThat(scene.code()).isEqualTo(ErrorCode.VALIDATION_FAILED);
              @SuppressWarnings("unchecked")
              List<Map<String, String>> errors =
                  (List<Map<String, String>>) scene.details().get("errors");
              assertThat(errors)
                  .extracting(error -> error.get("code"))
                  .contains("UNKNOWN_PERMISSION", "DUPLICATE_PERMISSION");
            });
    OperatorPermissions normalized =
        permissions.replace(
            fx.ownerId, fx.spaceId, fx.eventId, fx.staffId, List.of("EVENT_READ"), List.of());
    assertThat(normalized.grants()).isEmpty();
    assertThat(normalized.effective()).contains("EVENT_READ");
    assertThat(overrideCount(fx.eventId, fx.staffId)).isZero();
  }

  private static void assertCode(ErrorCode code, Throwing call) {
    assertThatThrownBy(call::run)
        .isInstanceOf(SceneException.class)
        .satisfies(thrown -> assertThat(((SceneException) thrown).code()).isEqualTo(code));
  }

  private Fixture seed(String lifecycle) {
    Fixture fx = Fixture.create();
    user(fx.ownerId, "owner");
    user(fx.managerId, "manager");
    user(fx.staffId, "staff");
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, 'space')", fx.spaceId);
    member(fx.spaceId, fx.ownerId, "OWNER");
    member(fx.spaceId, fx.managerId, "MEMBER");
    member(fx.spaceId, fx.staffId, "MEMBER");
    jdbc.update(
        """
        INSERT INTO events (id, space_id, name, lifecycle_status, lifecycle_version)
        VALUES (?, ?, 'event', ?, 0)
        """,
        fx.eventId,
        fx.spaceId,
        lifecycle);
    operator(fx, fx.ownerId, "OWNER");
    operator(fx, fx.managerId, "MANAGER");
    operator(fx, fx.staffId, "STAFF");
    return fx;
  }

  private void user(UUID id, String name) {
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, ?)", id, name);
  }

  private UUID user(String name) {
    UUID id = UUID.randomUUID();
    user(id, name);
    return id;
  }

  private void member(UUID spaceId, UUID userId, String role) {
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, ?)", spaceId, userId, role);
  }

  private void operator(Fixture fx, UUID userId, String role) {
    jdbc.update(
        "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, ?)",
        fx.spaceId,
        fx.eventId,
        userId,
        role);
  }

  private int overrideCount(UUID eventId, UUID userId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM event_user_permissions WHERE event_id = ? AND user_id = ?",
        Integer.class,
        eventId,
        userId);
  }

  private int auditCount(Fixture fx, String action) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_logs WHERE event_id = ? AND action = ?",
        Integer.class,
        fx.eventId,
        action);
  }

  private String auditDetail(Fixture fx, String action) {
    return jdbc.queryForObject(
        "SELECT detail::text FROM audit_logs WHERE event_id = ? AND action = ?",
        String.class,
        fx.eventId,
        action);
  }

  private String role(UUID eventId, UUID userId) {
    return jdbc.queryForObject(
        "SELECT role FROM event_users WHERE event_id = ? AND user_id = ?",
        String.class,
        eventId,
        userId);
  }

  private String grantedAt(UUID eventId, UUID userId) {
    return jdbc.queryForObject(
        "SELECT granted_at::text FROM event_user_permissions WHERE event_id = ? AND user_id = ?",
        String.class,
        eventId,
        userId);
  }

  private record Fixture(UUID spaceId, UUID eventId, UUID ownerId, UUID managerId, UUID staffId) {
    static Fixture create() {
      return new Fixture(
          UUID.randomUUID(),
          UUID.randomUUID(),
          UUID.randomUUID(),
          UUID.randomUUID(),
          UUID.randomUUID());
    }
  }

  @FunctionalInterface
  private interface Throwing {
    void run();
  }
}
