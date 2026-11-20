package app.scene.common.permission;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.EnumSet;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

class PermissionEvaluatorTest {

  @Test
  void taskWriteFollowsRoleGrantRevokeAndEndedHandover() {
    assertThat(effective("OWNER", false, null)).isTrue();
    assertThat(effective("MANAGER", false, null)).isTrue();
    assertThat(effective("STAFF", false, null)).isFalse();
    assertThat(effective("STAFF", false, "GRANT")).isTrue();
    assertThat(effective("MANAGER", false, "REVOKE")).isFalse();
    assertThat(effective("OWNER", false, "REVOKE")).isTrue();
    assertThat(effective("OWNER", true, null)).isFalse();
    assertThat(effective("OWNER", true, "GRANT")).isTrue();
    assertThat(effective("OWNER", true, "REVOKE")).isFalse();
  }

  @Test
  void managerHoldsEveryKeyButTheOwnerOnlyOnesAndStaffKeepsReadAndCheckIn() {
    EnumSet<Permission> expected = EnumSet.allOf(Permission.class);
    expected.remove(Permission.EVENT_LIFECYCLE);
    expected.remove(Permission.EVENT_USER_MANAGE);
    assertThat(RoleDefaults.of("MANAGER")).containsExactlyInAnyOrderElementsOf(expected);
    assertThat(RoleDefaults.of("MANAGER"))
        .contains(
            Permission.GROUP_WRITE,
            Permission.PARTICIPANT_WRITE,
            Permission.PARTICIPANT_CONTACT_READ,
            Permission.DATA_EXPORT,
            Permission.SCHEDULE_WRITE,
            Permission.NOTICE_WRITE)
        .doesNotContain(Permission.EVENT_LIFECYCLE, Permission.EVENT_USER_MANAGE);
    assertThat(RoleDefaults.of("STAFF"))
        .containsExactlyInAnyOrder(Permission.EVENT_READ, Permission.CHECKIN_WRITE);
    assertThat(RoleDefaults.of("OWNER"))
        .containsExactlyInAnyOrderElementsOf(Permission.allEventKeys());
  }

  @Test
  void managerDefaultFollowsEveryNonOwnerOnlyKey() {
    for (Permission key : Permission.values()) {
      assertThat(RoleDefaults.of("MANAGER").contains(key)).isEqualTo(!key.ownerOnly());
    }
  }

  @Test
  void managerRevokeStillNarrowsTheWiderDefault() {
    Set<Permission> effective =
        PermissionEvaluator.effective("MANAGER", false, Map.of(Permission.DATA_EXPORT, "REVOKE"));
    assertThat(effective).doesNotContain(Permission.DATA_EXPORT);
    assertThat(effective).contains(Permission.GROUP_WRITE, Permission.PARTICIPANT_CONTACT_READ);
  }

  @Test
  void ownerOnlyGrantDoesNotApplyToManager() {
    Set<Permission> effective =
        PermissionEvaluator.effective(
            "MANAGER",
            false,
            Map.of(Permission.EVENT_LIFECYCLE, "GRANT", Permission.EVENT_USER_MANAGE, "GRANT"));
    assertThat(effective).doesNotContain(Permission.EVENT_LIFECYCLE, Permission.EVENT_USER_MANAGE);
  }

  @Test
  void managerScheduleAndNoticeDefaultsGoOnRevokeAndStaffGetsThemOnlyByGrant() {
    for (Permission key : new Permission[] {Permission.SCHEDULE_WRITE, Permission.NOTICE_WRITE}) {
      assertThat(PermissionEvaluator.allows(key, "MANAGER", false, null)).isTrue();
      assertThat(PermissionEvaluator.allows(key, "MANAGER", false, "REVOKE")).isFalse();
      assertThat(PermissionEvaluator.allows(key, "STAFF", false, null)).isFalse();
      assertThat(PermissionEvaluator.allows(key, "STAFF", false, "GRANT")).isTrue();
    }
  }

  @Test
  void checkInWriteIsOnEveryRoleAndOwnerKeepsItOnRevoke() {
    for (String role : new String[] {"OWNER", "MANAGER", "STAFF"}) {
      assertThat(PermissionEvaluator.allows(Permission.CHECKIN_WRITE, role, false, null)).isTrue();
    }
    assertThat(PermissionEvaluator.allows(Permission.CHECKIN_WRITE, "STAFF", false, "REVOKE"))
        .isFalse();
    assertThat(PermissionEvaluator.allows(Permission.CHECKIN_WRITE, "MANAGER", false, "REVOKE"))
        .isFalse();
  }

  @Test
  void ownerOnlyGrantDoesNotApplyToStaff() {
    Set<Permission> effective =
        PermissionEvaluator.effective(
            "STAFF", false, Map.of(Permission.EVENT_USER_MANAGE, "GRANT"));
    assertThat(effective).doesNotContain(Permission.EVENT_USER_MANAGE);
    assertThat(effective).contains(Permission.EVENT_READ);
  }

  @Test
  void eventOnlyCollaboratorContactStaysHiddenWhenContactGrantsArePresent() {
    Set<Permission> granted =
        EnumSet.of(Permission.EVENT_USER_READ, Permission.PARTICIPANT_CONTACT_READ);
    assertThat(PermissionEvaluator.mayReadOtherOperatorContact(true, granted)).isFalse();
    assertThat(PermissionEvaluator.mayReadOtherOperatorContact(false, granted)).isTrue();
  }

  private static boolean effective(String role, boolean ownerAuthorityEnded, String storedEffect) {
    return PermissionEvaluator.allows(
        Permission.TASK_WRITE, role, ownerAuthorityEnded, storedEffect);
  }
}
