package app.scene.event.schedule;

import java.util.List;
import java.util.UUID;

/**
 * Items added, changed (with the changed field names) and removed against the latest publication.
 * The publication result's {@code changes}, the {@code otherChanges} of {@code 409
 * CONFIRMATION_REQUIRED}, and the stored {@code schedule_publications.changes}.
 */
public record ScheduleChanges(List<Ref> added, List<ChangedRef> changed, List<Ref> removed) {

  public static final ScheduleChanges NONE = new ScheduleChanges(List.of(), List.of(), List.of());

  public record Ref(UUID itemId, String title) {}

  public record ChangedRef(UUID itemId, String title, List<String> fields) {}

  public boolean any() {
    return !added.isEmpty() || !changed.isEmpty() || !removed.isEmpty();
  }

  public int count() {
    return added.size() + changed.size() + removed.size();
  }
}
