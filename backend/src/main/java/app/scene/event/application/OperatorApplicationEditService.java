package app.scene.event.application;

import app.scene.common.audit.AuditActions;
import app.scene.common.audit.AuditLogRepository;
import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.permission.Permission;
import app.scene.common.permission.PermissionEvaluator;
import app.scene.event.application.param.AnswerInsert;
import app.scene.event.application.param.ApplicationInsert;
import app.scene.event.form.FieldDefinition;
import app.scene.event.form.FieldRules;
import app.scene.event.form.FormFieldRow;
import app.scene.event.form.FormRepository;
import app.scene.event.lifecycle.EventAccessGate;
import app.scene.event.lifecycle.EventLocation;
import app.scene.event.lifecycle.EventRepository;
import app.scene.event.lifecycle.EventRow;
import app.scene.event.participant.Digests;
import app.scene.event.participant.ParticipantIdentity;
import app.scene.event.participant.ParticipantPins;
import app.scene.event.participant.ParticipantRepository;
import app.scene.event.participant.param.ParticipantInsert;
import app.scene.space.EventUserPermissionRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * An operator edits a participant's application and adds a participant (DEC-088, A12 #462, #339).
 * Both need effective {@code PARTICIPANT_WRITE} and store A4's revision shape with {@code
 * revised_by OPERATOR} and the operator's user id, so every reader of {@code SUBMITTED} rows
 * (summary, group board, CSV, applicant table, meal counts, arrival roster, room board, leader
 * view) follows. Answers go through {@link AnswerEvaluator#evaluateForOperator}: the form and edit
 * switches are not read, only the name and phone are required, and consent and hidden answers are
 * carried over. Locks are taken event row first, then the participant, like withdraw and restore.
 * Audit and notifications are in the same transaction; answer values, names, phones and the
 * temporary number are not in them.
 */
@Service
public class OperatorApplicationEditService {

  private static final String NAME = "NAME";
  private static final String PHONE = "PHONE";
  private static final String SUBMITTED = "SUBMITTED";
  private static final String WITHDRAWN = "WITHDRAWN";

  private final EventAccessGate gate;
  private final EventRepository events;
  private final FormRepository forms;
  private final ApplicationRepository applications;
  private final ApplicationRevisions revisions;
  private final ParticipantRepository participants;
  private final ParticipantPins pins;
  private final EventUserPermissionRepository permissions;
  private final AuditLogRepository auditLogs;
  private final ApplicationNotices notices;
  private final Clock clock;
  private final JsonMapper json;

  public OperatorApplicationEditService(
      EventAccessGate gate,
      EventRepository events,
      FormRepository forms,
      ApplicationRepository applications,
      ApplicationRevisions revisions,
      ParticipantRepository participants,
      ParticipantPins pins,
      EventUserPermissionRepository permissions,
      AuditLogRepository auditLogs,
      ApplicationNotices notices,
      Clock clock,
      JsonMapper json) {
    this.gate = gate;
    this.events = events;
    this.forms = forms;
    this.applications = applications;
    this.revisions = revisions;
    this.participants = participants;
    this.pins = pins;
    this.permissions = permissions;
    this.auditLogs = auditLogs;
    this.notices = notices;
    this.clock = clock;
    this.json = json;
  }

  /** The edit's answer: {@code revised} is false when nothing changed and no revision was made. */
  public record Revised(UUID applicationId, UUID participantId, int revision, boolean revised) {}

  /** A participant an operator added. {@code temporaryPin} is shown once. */
  public record Added(UUID applicationId, UUID participantId, int revision, String temporaryPin) {}

  /**
   * {@code PUT …/applications/{applicationId}/answers}. Order: 404 → 403 → 400 {@code
   * expectedRevision} → 409 event → 409 application → 400 answers → 409 phone.
   */
  @Transactional
  public Revised revise(UUID actorId, UUID eventId, UUID applicationId, JsonNode body) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    UUID spaceId = opened.location().spaceId();
    ApplicationRevisionRow target = revisions.find(spaceId, eventId, applicationId);
    if (target == null) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    if (!allows(opened, actorId)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    int expected = expectedRevision(body);
    EventRow event = events.getForUpdate(spaceId, eventId);
    if ("ARCHIVED".equals(event.lifecycleStatus())) {
      throw new SceneException(ErrorCode.EVENT_ARCHIVED);
    }
    UUID participantId = target.participantId();
    ApplicationRevisionRow latest = revisions.lockLatest(spaceId, eventId, participantId);
    if (WITHDRAWN.equals(latest.status())) {
      throw new SceneException(
          ErrorCode.INVALID_STATE_TRANSITION, Map.of("applicationStatus", WITHDRAWN));
    }
    if (!SUBMITTED.equals(latest.status())
        || !latest.applicationId().equals(applicationId)
        || latest.revision() != expected) {
      throw stale(latest);
    }
    List<FieldDefinition> fields = fields(spaceId, eventId, latest.formId());
    List<AnswerEvaluator.Answer> answers =
        AnswerEvaluator.evaluateForOperator(answersOnly(body), fields);
    ParticipantIdentity participant =
        participants
            .findById(spaceId, eventId, participantId)
            .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
    String phone = required(answers, PHONE).text();
    Instant now = clock.instant();
    boolean phoneChanged =
        !ParticipantPins.digits(phone).equals(ParticipantPins.digits(participant.phone()));
    if (phoneChanged) {
      Optional<ParticipantIdentity> other =
          participants.findByPhoneKey(spaceId, eventId, ParticipantPins.phoneKey(phone));
      if (other.isPresent() && !other.get().id().equals(participantId)) {
        throw new SceneException(ErrorCode.APPLICATION_ALREADY_EXISTS);
      }
    }
    ApplicationRevisions.Result result =
        revisions.revise(
            spaceId,
            eventId,
            latest,
            fields,
            answers,
            participant.name(),
            ApplicationRevisions.BY_OPERATOR,
            actorId);
    if (!result.revised()) {
      return new Revised(latest.applicationId(), participantId, latest.revision(), false);
    }
    if (phoneChanged) {
      try {
        participants.updatePhone(spaceId, eventId, participantId, phone, now);
      } catch (DuplicateKeyException exception) {
        throw new SceneException(ErrorCode.APPLICATION_ALREADY_EXISTS);
      }
    }
    List<String> fieldIds = new ArrayList<>();
    for (UUID id : result.changedFieldIds()) {
      fieldIds.add("\"" + id + "\"");
    }
    auditLogs.save(
        spaceId,
        eventId,
        actorId,
        AuditActions.APPLICATION_REVISED_BY_OPERATOR,
        "{\"applicationId\":\""
            + result.applicationId()
            + "\",\"previousApplicationId\":\""
            + result.previousApplicationId()
            + "\",\"participantId\":\""
            + participantId
            + "\",\"revision\":"
            + result.revision()
            + ",\"fieldIds\":["
            + String.join(",", fieldIds)
            + "]}",
        now);
    notices.operatorRevised(spaceId, eventId, participantId, result, actorId);
    return new Revised(result.applicationId(), participantId, result.revision(), true);
  }

  /**
   * {@code POST …/applications}. Order: 404 event → 403 → 400 {@code formId} → 404 form → 409 event
   * → 400 answers → 409 phone.
   */
  @Transactional
  public Added add(UUID actorId, UUID eventId, JsonNode body) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (!allows(opened, actorId)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    UUID spaceId = opened.location().spaceId();
    UUID formId = formId(body);
    if (forms.find(spaceId, eventId, formId).isEmpty()) {
      throw new SceneException(ErrorCode.FORM_NOT_FOUND);
    }
    EventRow event = events.getForUpdate(spaceId, eventId);
    switch (event.lifecycleStatus()) {
      case "DRAFT", "ACTIVE" -> {}
      case "ENDED" -> throw new SceneException(ErrorCode.EVENT_ENDED);
      case "ARCHIVED" -> throw new SceneException(ErrorCode.EVENT_ARCHIVED);
      default ->
          throw new SceneException(
              ErrorCode.INVALID_STATE_TRANSITION, Map.of("eventStatus", event.lifecycleStatus()));
    }
    List<FieldDefinition> fields = fields(spaceId, eventId, formId);
    List<AnswerEvaluator.Answer> answers =
        AnswerEvaluator.evaluateForOperator(answersOnly(body), fields);
    String name = required(answers, NAME).text();
    String phone = required(answers, PHONE).text();
    String phoneKey = ParticipantPins.phoneKey(phone);
    Optional<ParticipantIdentity> existing =
        participants.findByPhoneKey(spaceId, eventId, phoneKey);
    if (existing.isPresent()) {
      throw alreadyExists(spaceId, eventId, existing.get().id());
    }
    Instant now = clock.instant();
    UUID participantId = UUID.randomUUID();
    UUID applicationId = UUID.randomUUID();
    String digits = ParticipantPins.digits(phone);
    String temporary = pins.temporary(digits);
    String temporaryHash = pins.hash(temporary);
    try {
      participants.save(
          ParticipantInsert.of(
              participantId,
              spaceId,
              eventId,
              name,
              phone,
              Digests.sha256Hex(phone),
              digits.substring(digits.length() - 4),
              phoneKey,
              temporaryHash,
              now,
              now));
    } catch (DuplicateKeyException exception) {
      throw new SceneException(ErrorCode.APPLICATION_ALREADY_EXISTS);
    }
    // The insert stores a chosen number; mark it temporary so the participant must change it.
    participants.updatePin(spaceId, eventId, participantId, temporaryHash, true, now);
    List<AnswerInsert> rows = new ArrayList<>();
    for (AnswerEvaluator.Answer answer : answers) {
      rows.add(
          AnswerInsert.of(
              UUID.randomUUID(),
              spaceId,
              eventId,
              applicationId,
              answer.fieldId(),
              json.writeValueAsString(answer.value())));
    }
    applications.save(
        ApplicationInsert.of(
            applicationId, spaceId, eventId, formId, participantId, SUBMITTED, now),
        rows);
    revisions.markAddedBy(spaceId, eventId, applicationId, actorId);
    auditLogs.save(
        spaceId,
        eventId,
        actorId,
        AuditActions.PARTICIPANT_ADDED,
        "{\"participantId\":\"" + participantId + "\",\"applicationId\":\"" + applicationId + "\"}",
        now);
    notices.operatorAdded(spaceId, eventId, applicationId, name, actorId);
    return new Added(applicationId, participantId, 1, temporary);
  }

  private boolean allows(EventAccessGate.Opened opened, UUID actorId) {
    if (opened.eventRole() == null) {
      return false;
    }
    EventLocation location = opened.location();
    String effect =
        permissions
            .findEffect(
                location.spaceId(), location.id(), actorId, Permission.PARTICIPANT_WRITE.name())
            .orElse(null);
    return PermissionEvaluator.allows(
        Permission.PARTICIPANT_WRITE, opened.eventRole(), opened.authorityEnded(), effect);
  }

  /** The phone already belongs to a participant: point at their latest application. */
  private SceneException alreadyExists(UUID spaceId, UUID eventId, UUID participantId) {
    ApplicationRevisionRow latest = revisions.findLatest(spaceId, eventId, participantId);
    if (latest == null) {
      return new SceneException(ErrorCode.APPLICATION_ALREADY_EXISTS);
    }
    Map<String, Object> details = new LinkedHashMap<>();
    details.put("applicationId", latest.applicationId().toString());
    details.put("status", latest.status());
    return new SceneException(ErrorCode.APPLICATION_ALREADY_EXISTS, details);
  }

  private static SceneException stale(ApplicationRevisionRow latest) {
    Map<String, Object> details = new LinkedHashMap<>();
    details.put("applicationId", latest.applicationId().toString());
    details.put("status", latest.status());
    details.put("revision", latest.revision());
    return new SceneException(ErrorCode.CONCURRENT_MODIFICATION, details);
  }

  private List<FieldDefinition> fields(UUID spaceId, UUID eventId, UUID formId) {
    List<FieldDefinition> fields = new ArrayList<>();
    for (FormFieldRow row : forms.findFields(spaceId, eventId, formId)) {
      fields.add(FieldDefinition.from(row, json));
    }
    return fields;
  }

  private static int expectedRevision(JsonNode body) {
    JsonNode node = body == null || !body.isObject() ? null : body.get("expectedRevision");
    if (node == null || !node.isIntegralNumber() || !node.canConvertToInt() || node.asInt() < 1) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "expectedRevision"));
    }
    return node.asInt();
  }

  private static UUID formId(JsonNode body) {
    JsonNode node = body == null || !body.isObject() ? null : body.get("formId");
    UUID id = node != null && node.isString() ? FieldRules.uuid(node.asString()) : null;
    if (id == null) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "formId"));
    }
    return id;
  }

  /** The body the evaluator reads: the same object without the routing keys. */
  private static JsonNode answersOnly(JsonNode body) {
    ObjectNode copy = ((ObjectNode) body).deepCopy();
    copy.remove("expectedRevision");
    copy.remove("formId");
    return copy;
  }

  private static AnswerEvaluator.Answer required(
      List<AnswerEvaluator.Answer> answers, String systemKey) {
    for (AnswerEvaluator.Answer answer : answers) {
      if (systemKey.equals(answer.systemKey())) {
        return answer;
      }
    }
    throw new SceneException(ErrorCode.APPLICATION_VALIDATION_FAILED);
  }
}
