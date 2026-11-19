package app.scene.event.application;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.event.application.mapper.AnswerMapper;
import app.scene.event.application.mapper.ApplicationRevisionMapper;
import app.scene.event.application.param.AnswerInsert;
import app.scene.event.form.FieldDefinition;
import app.scene.event.participant.ParticipantRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Stores an edit as a new revision (DEC-078 §4, #402). The new answers become a new {@code
 * SUBMITTED} application row with {@code revision} + 1; the previous row becomes {@code
 * SUPERSEDED}. Answers of hidden questions are carried over because the participant cannot see
 * them. The operator memo moves to the new row (DEC-075). Group assignments and check-ins hang on
 * the participant and stay. When nothing changed, no row is written.
 */
@Component
public class ApplicationRevisions {

  public static final String BY_PARTICIPANT = "PARTICIPANT";
  public static final String BY_OPERATOR = "OPERATOR";

  private static final String NAME = "NAME";

  private final ApplicationRevisionMapper revisions;
  private final ApplicationRepository applications;
  private final AnswerMapper answers;
  private final ParticipantRepository participants;
  private final Clock clock;
  private final JsonMapper json;

  public ApplicationRevisions(
      ApplicationRevisionMapper revisions,
      ApplicationRepository applications,
      AnswerMapper answers,
      ParticipantRepository participants,
      Clock clock,
      JsonMapper json) {
    this.revisions = revisions;
    this.applications = applications;
    this.answers = answers;
    this.participants = participants;
    this.clock = clock;
    this.json = json;
  }

  /** The stored result of an edit. {@code revised} is false when nothing changed. */
  public record Result(UUID applicationId, UUID formId, int revision, boolean revised) {}

  /**
   * Locks the participant and returns the current {@code SUBMITTED} revision, or 404. Callers that
   * revise call this first in the same transaction.
   */
  @Transactional
  public ApplicationRevisionRow lockCurrent(UUID spaceId, UUID eventId, UUID participantId) {
    revisions.lockParticipant(spaceId, eventId, participantId);
    ApplicationRevisionRow current = revisions.findCurrent(spaceId, eventId, participantId);
    if (current == null) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    return current;
  }

  public ApplicationRevisionRow findCurrent(UUID spaceId, UUID eventId, UUID participantId) {
    return revisions.findCurrent(spaceId, eventId, participantId);
  }

  public ApplicationRevisionRow find(UUID spaceId, UUID eventId, UUID applicationId) {
    return revisions.find(spaceId, eventId, applicationId);
  }

  public List<ApplicationRevisionRow> listByApplication(
      UUID spaceId, UUID eventId, UUID applicationId) {
    UUID participantId = revisions.findParticipantOf(spaceId, eventId, applicationId);
    if (participantId == null) {
      return List.of();
    }
    return revisions.listByParticipant(spaceId, eventId, participantId);
  }

  /**
   * Stores {@code evaluated} as the next revision of {@code current}. {@code fields} are the form's
   * fields in position order, hidden ones included.
   */
  @Transactional
  public Result revise(
      UUID spaceId,
      UUID eventId,
      ApplicationRevisionRow current,
      List<FieldDefinition> fields,
      List<AnswerEvaluator.Answer> evaluated,
      String currentName,
      String revisedBy,
      UUID revisedByUserId) {
    Map<UUID, JsonNode> before = new HashMap<>();
    for (ApplicationAnswerRow row :
        applications.findAnswers(spaceId, eventId, current.applicationId())) {
      before.put(row.fieldId(), json.readTree(row.value()));
    }
    Map<UUID, JsonNode> after = new LinkedHashMap<>();
    for (AnswerEvaluator.Answer answer : evaluated) {
      after.put(answer.fieldId(), answer.value());
    }
    for (FieldDefinition field : fields) {
      if (field.hidden() && before.containsKey(field.fieldId())) {
        after.put(field.fieldId(), before.get(field.fieldId()));
      }
    }
    ArrayNode changes = json.createArrayNode();
    String newName = null;
    for (FieldDefinition field : fields) {
      JsonNode old = before.get(field.fieldId());
      JsonNode next = after.get(field.fieldId());
      if (Objects.equals(old, next)) {
        continue;
      }
      boolean isName = NAME.equals(field.systemKey());
      ObjectNode change = changes.addObject();
      change.put("key", isName ? NAME : "FIELD");
      change.put("fieldId", field.fieldId().toString());
      change.put("label", field.label());
      if (isName && next != null) {
        newName = next.path("text").asString();
      }
    }
    if (changes.isEmpty()) {
      return new Result(current.applicationId(), current.formId(), current.revision(), false);
    }
    Instant now = clock.instant();
    if (revisions.supersede(spaceId, eventId, current.applicationId()) != 1) {
      throw new SceneException(
          ErrorCode.CONCURRENT_MODIFICATION, Map.of("revision", current.revision()));
    }
    UUID nextId = UUID.randomUUID();
    int nextRevision = current.revision() + 1;
    revisions.insertRevision(
        nextId,
        spaceId,
        eventId,
        current.formId(),
        current.participantId(),
        nextRevision,
        current.applicationId(),
        revisedBy,
        revisedByUserId,
        json.writeValueAsString(changes),
        now);
    List<AnswerInsert> rows = new ArrayList<>();
    for (Map.Entry<UUID, JsonNode> entry : after.entrySet()) {
      rows.add(
          AnswerInsert.of(
              UUID.randomUUID(),
              spaceId,
              eventId,
              nextId,
              entry.getKey(),
              json.writeValueAsString(entry.getValue())));
    }
    for (AnswerInsert row : rows) {
      if (answers.save(row) != 1) {
        throw new IllegalStateException("answer was not stored");
      }
    }
    revisions.moveOperation(spaceId, eventId, current.applicationId(), nextId);
    if (newName != null && !newName.equals(currentName)) {
      participants.updateName(spaceId, eventId, current.participantId(), newName, now);
    }
    return new Result(nextId, current.formId(), nextRevision, true);
  }
}
