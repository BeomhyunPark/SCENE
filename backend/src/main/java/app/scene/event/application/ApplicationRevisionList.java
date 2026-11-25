package app.scene.event.application;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import tools.jackson.databind.JsonNode;

/** Revisions of one participant's application, newest first (DEC-078 §4). */
public record ApplicationRevisionList(List<Item> items) {

  public ApplicationRevisionList {
    items = List.copyOf(items);
  }

  /**
   * {@code revisedBy} is null for the first submit, {@code PARTICIPANT} or {@code OPERATOR} after;
   * a first revision with {@code OPERATOR} is a participant an operator added (DEC-088 §3). {@code
   * revisedByDisplayName} is that operator's display name. {@code changes} items are {@code {key,
   * fieldId, label}}; answer values are not here.
   */
  public record Item(
      UUID applicationId,
      int revision,
      String status,
      Instant submittedAt,
      String revisedBy,
      UUID revisedByUserId,
      String revisedByDisplayName,
      JsonNode changes) {}
}
