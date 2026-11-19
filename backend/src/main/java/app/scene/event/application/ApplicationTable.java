package app.scene.event.application;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import tools.jackson.databind.JsonNode;

/**
 * Every submitted application of the event with every answer the reader may see, for the operator
 * table (#308). The screen filters, sorts and counts these rows itself. {@code formId} is null when
 * the event has no form.
 *
 * <p>{@code contactVisible} is true when phone questions are in {@code columns}; without {@code
 * PARTICIPANT_CONTACT_READ} those columns and their answers are left out. {@code groupVisible} is
 * true when each row carries its working-copy {@code group}; otherwise every {@code group} is null.
 */
public record ApplicationTable(
    UUID formId,
    boolean contactVisible,
    boolean groupVisible,
    List<Column> columns,
    List<Row> rows,
    List<Slot> slots) {

  /**
   * One question in position order, with its current type, hidden flag and config (the same fields
   * as an answer on the detail). {@code presetKey} is the generated question's key (DEC-070), such
   * as {@code ATTENDANCE}, {@code MIDDLE_GROUP} or {@code CELL}, or null. {@code contact} is true
   * for a phone question.
   */
  public record Column(
      UUID fieldId,
      String kind,
      String systemKey,
      String presetKey,
      String label,
      int position,
      String answerType,
      boolean hidden,
      JsonNode config,
      boolean contact) {}

  /**
   * One applicant. {@code answers} maps a field id to the stored value (DEC-068 §1); a question
   * with no answer has no key. {@code checkedInAt} is the arrival time, or null. {@code slotIds}
   * are the {@code slots} the applicant attends, in slot order, by the summary's and the board's
   * rule (DEC-074); null when unknown or when there are no slots. {@code participantId} is the id
   * the group board and {@code group-assignments} use. {@code operation} is the operator values
   * (#335, DEC-075), such as the operator memo; version 0 when none is stored. {@code revision}
   * counts edits from 1 (DEC-078 §4).
   */
  public record Row(
      UUID applicationId,
      UUID participantId,
      Instant submittedAt,
      Map<UUID, JsonNode> answers,
      Group group,
      Instant checkedInAt,
      List<String> slotIds,
      ApplicationOperation operation,
      int revision) {}

  /**
   * One meal or worship slot of the form setup, the same as the group board's {@code slots[]} item
   * (DEC-072). {@code slots} is null when the form has no setup or no slot.
   */
  public record Slot(
      String slotId,
      int day,
      String date,
      String dayLabel,
      String meal,
      String label,
      int sortOrder) {}

  /** Working-copy group (DEC-072). */
  public record Group(UUID groupId, String name, boolean leader) {}
}
