package app.scene.event.application;

import app.scene.event.room.Lodging;
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
 *
 * <p>{@code roomPublishedAt} is the latest room publication's time (G5 #460, DEC-085 §10), or null
 * before the first one; each row's {@code room} is from that publication, never the working copy.
 *
 * <p>{@code withdrawn} lists the withdrawn applicants apart from {@code rows} (DEC-084 §9), so no
 * count of the screen includes them; the screen hides them until asked.
 */
public record ApplicationTable(
    UUID formId,
    boolean contactVisible,
    boolean groupVisible,
    List<Column> columns,
    List<Row> rows,
    List<Slot> slots,
    List<Withdrawn> withdrawn,
    Instant roomPublishedAt) {

  /**
   * A participant whose latest revision is withdrawn, newest withdraw first. {@code previousGroup}
   * is the group the withdraw removed when it still exists, only with {@code groupVisible}; it is a
   * reference and is not restored (DEC-044). {@code checkedInAt} is a kept arrival check-in that no
   * longer counts.
   */
  public record Withdrawn(
      UUID applicationId,
      UUID participantId,
      String name,
      Instant submittedAt,
      ApplicationWithdrawal withdrawal,
      WithdrawnRow.PreviousGroup previousGroup,
      Instant checkedInAt) {}

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
   * counts edits from 1 (DEC-078 §4); above 1 the screen marks the row "수정됨", {@code submittedAt}
   * is then the time of that last edit, and {@code revisedBy} says who stored it ({@code
   * PARTICIPANT} or {@code OPERATOR}; null for revision 1). {@code room} is the published room,
   * null before publication or when unassigned; {@code lodging} is the lodging state now ({@code
   * LODGING}, {@code NOT_LODGING}, {@code UNKNOWN}, the room board's rule), so a blank room can be
   * told apart from "숙박 안 함".
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
      int revision,
      String revisedBy,
      Room room,
      Lodging lodging) {}

  /** A room of the latest room publication (DEC-085 §10). */
  public record Room(UUID roomId, String name) {}

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
