package app.scene.event.group;

import app.scene.event.group.ParticipantGroup.Attendance;
import app.scene.event.group.ParticipantGroup.CheckInState;
import app.scene.event.group.ParticipantGroup.Room;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import tools.jackson.databind.JsonNode;

/**
 * {@code GET /api/v1/participant/group/members/{participantId}} (DEC-083 §3): one member as their
 * leader reads them. {@code phone} is the application phone. No operator memo, no turned-off
 * question, no consent answer, no number or key.
 */
public record ParticipantGroupMember(
    UUID participantId,
    String name,
    String cohort,
    String gender,
    boolean leader,
    String phone,
    CheckInState checkIn,
    Attendance attendance,
    Room room,
    Application application) {

  public record Application(
      Instant submittedAt, Instant revisedAt, boolean revisedByOperator, List<Answer> answers) {}

  public record Answer(
      UUID fieldId,
      String presetKey,
      String label,
      String type,
      String display,
      JsonNode value,
      boolean operatorEdited) {}
}
