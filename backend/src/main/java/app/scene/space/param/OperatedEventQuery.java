package app.scene.space.param;

import java.util.List;
import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class OperatedEventQuery {

  private final UUID spaceId;
  private final UUID userId;
  private final String ownerRole;
  private final String handoverStatus;
  private final List<String> openStatuses;
  private final List<String> authorityStatuses;

  private OperatedEventQuery(
      UUID spaceId,
      UUID userId,
      String ownerRole,
      String handoverStatus,
      List<String> openStatuses,
      List<String> authorityStatuses) {
    this.spaceId = spaceId;
    this.userId = userId;
    this.ownerRole = ownerRole;
    this.handoverStatus = handoverStatus;
    this.openStatuses = openStatuses;
    this.authorityStatuses = authorityStatuses;
  }

  public static OperatedEventQuery of(
      UUID spaceId,
      UUID userId,
      String ownerRole,
      String handoverStatus,
      List<String> openStatuses,
      List<String> authorityStatuses) {
    return new OperatedEventQuery(
        spaceId, userId, ownerRole, handoverStatus, openStatuses, authorityStatuses);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getUserId() {
    return userId;
  }

  public String getOwnerRole() {
    return ownerRole;
  }

  public String getHandoverStatus() {
    return handoverStatus;
  }

  public List<String> getOpenStatuses() {
    return openStatuses;
  }

  public List<String> getAuthorityStatuses() {
    return authorityStatuses;
  }
}
