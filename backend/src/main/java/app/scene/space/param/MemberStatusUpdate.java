package app.scene.space.param;

import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class MemberStatusUpdate {

  private final UUID spaceId;
  private final UUID userId;
  private final String leftStatus;
  private final String activeStatus;

  private MemberStatusUpdate(UUID spaceId, UUID userId, String leftStatus, String activeStatus) {
    this.spaceId = spaceId;
    this.userId = userId;
    this.leftStatus = leftStatus;
    this.activeStatus = activeStatus;
  }

  public static MemberStatusUpdate of(
      UUID spaceId, UUID userId, String leftStatus, String activeStatus) {
    return new MemberStatusUpdate(spaceId, userId, leftStatus, activeStatus);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getUserId() {
    return userId;
  }

  public String getLeftStatus() {
    return leftStatus;
  }

  public String getActiveStatus() {
    return activeStatus;
  }
}
