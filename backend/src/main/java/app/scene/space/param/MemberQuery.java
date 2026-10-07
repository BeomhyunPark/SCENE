package app.scene.space.param;

import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class MemberQuery {

  private final UUID spaceId;
  private final UUID userId;
  private final String activeStatus;
  private final String role;
  private final boolean excludeUser;

  private MemberQuery(
      UUID spaceId, UUID userId, String activeStatus, String role, boolean excludeUser) {
    this.spaceId = spaceId;
    this.userId = userId;
    this.activeStatus = activeStatus;
    this.role = role;
    this.excludeUser = excludeUser;
  }

  public static MemberQuery of(
      UUID spaceId, UUID userId, String activeStatus, String role, boolean excludeUser) {
    return new MemberQuery(spaceId, userId, activeStatus, role, excludeUser);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getUserId() {
    return userId;
  }

  public String getActiveStatus() {
    return activeStatus;
  }

  public String getRole() {
    return role;
  }

  public boolean getExcludeUser() {
    return excludeUser;
  }
}
