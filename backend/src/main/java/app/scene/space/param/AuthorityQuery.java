package app.scene.space.param;

import java.util.List;
import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class AuthorityQuery {

  private final UUID spaceId;
  private final UUID eventId;
  private final UUID userId;
  private final List<String> authorityStatuses;

  private AuthorityQuery(UUID spaceId, UUID eventId, UUID userId, List<String> authorityStatuses) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.userId = userId;
    this.authorityStatuses = authorityStatuses;
  }

  public static AuthorityQuery of(
      UUID spaceId, UUID eventId, UUID userId, List<String> authorityStatuses) {
    return new AuthorityQuery(spaceId, eventId, userId, authorityStatuses);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }

  public UUID getUserId() {
    return userId;
  }

  public List<String> getAuthorityStatuses() {
    return authorityStatuses;
  }
}
