package app.scene.event.lifecycle.param;

import java.util.UUID;

/** Values for one new event row. Status and version are fixed in the statement. */
public final class EventInsert {

  private final UUID id;
  private final UUID spaceId;
  private final String name;

  private EventInsert(UUID id, UUID spaceId, String name) {
    this.id = id;
    this.spaceId = spaceId;
    this.name = name;
  }

  public static EventInsert of(UUID id, UUID spaceId, String name) {
    return new EventInsert(id, spaceId, name);
  }

  public UUID getId() {
    return id;
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public String getName() {
    return name;
  }
}
