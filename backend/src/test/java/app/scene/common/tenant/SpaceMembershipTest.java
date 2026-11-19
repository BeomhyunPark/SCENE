package app.scene.common.tenant;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SpaceMembershipTest {

  private static final SpaceMembership OWNER = SpaceMembership.active("OWNER");
  private static final SpaceMembership ADMIN = SpaceMembership.active("ADMIN");
  private static final SpaceMembership MEMBER = SpaceMembership.active("MEMBER");
  private static final SpaceMembership ENDED = SpaceMembership.ended();
  private static final SpaceMembership ABSENT = SpaceMembership.absent();

  @Test
  void activeOwnerAndAdminSeeEveryEvent() {
    assertThat(OWNER.seesEveryEvent()).isTrue();
    assertThat(ADMIN.seesEveryEvent()).isTrue();
    assertThat(MEMBER.seesEveryEvent()).isFalse();
    assertThat(ENDED.seesEveryEvent()).isFalse();
    assertThat(ABSENT.seesEveryEvent()).isFalse();
  }

  @Test
  void endedOwnerOrAdminDoesNotSeeEveryEvent() {
    assertThat(new SpaceMembership(SpaceMembership.Kind.ENDED, "OWNER").seesEveryEvent()).isFalse();
    assertThat(new SpaceMembership(SpaceMembership.Kind.ENDED, "ADMIN").seesEveryEvent()).isFalse();
  }

  @Test
  void activeOwnerAndAdminMayInviteMembers() {
    assertThat(OWNER.mayInviteMembers()).isTrue();
    assertThat(ADMIN.mayInviteMembers()).isTrue();
    assertThat(MEMBER.mayInviteMembers()).isFalse();
    assertThat(ENDED.mayInviteMembers()).isFalse();
    assertThat(ABSENT.mayInviteMembers()).isFalse();
    assertThat(new SpaceMembership(SpaceMembership.Kind.ENDED, "ADMIN").mayInviteMembers())
        .isFalse();
  }

  @Test
  void onlyActiveOwnerAndAdminMayCreateEvents() {
    assertThat(OWNER.mayCreateEvents()).isTrue();
    assertThat(ADMIN.mayCreateEvents()).isTrue();
    assertThat(MEMBER.mayCreateEvents()).isFalse();
    assertThat(ENDED.mayCreateEvents()).isFalse();
    assertThat(ABSENT.mayCreateEvents()).isFalse();
    assertThat(new SpaceMembership(SpaceMembership.Kind.ENDED, "OWNER").mayCreateEvents())
        .isFalse();
  }

  @Test
  void onlyActiveOwnerMayInviteAsAdmin() {
    assertThat(OWNER.mayInviteAsAdmin()).isTrue();
    assertThat(ADMIN.mayInviteAsAdmin()).isFalse();
    assertThat(MEMBER.mayInviteAsAdmin()).isFalse();
    assertThat(ENDED.mayInviteAsAdmin()).isFalse();
    assertThat(new SpaceMembership(SpaceMembership.Kind.ENDED, "OWNER").mayInviteAsAdmin())
        .isFalse();
  }

  @Test
  void eventPermissionReadStaysOwnerOnly() {
    assertThat(OWNER.mayReadEventPermissions()).isTrue();
    assertThat(ADMIN.mayReadEventPermissions()).isFalse();
    assertThat(MEMBER.mayReadEventPermissions()).isFalse();
    assertThat(ENDED.mayReadEventPermissions()).isFalse();
  }

  @Test
  void noSpaceRoleChangesEventOperators() {
    assertThat(OWNER.mayChangeEventOperators()).isFalse();
    assertThat(ADMIN.mayChangeEventOperators()).isFalse();
  }
}
