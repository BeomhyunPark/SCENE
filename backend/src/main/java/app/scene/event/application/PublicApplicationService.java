package app.scene.event.application;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.event.application.param.AnswerInsert;
import app.scene.event.application.param.ApplicationInsert;
import app.scene.event.form.FieldDefinition;
import app.scene.event.form.FormFieldRow;
import app.scene.event.form.FormRepository;
import app.scene.event.form.FormRow;
import app.scene.event.lifecycle.EventLocation;
import app.scene.event.lifecycle.EventRepository;
import app.scene.event.participant.Digests;
import app.scene.event.participant.ParticipantGuard;
import app.scene.event.participant.ParticipantIdentity;
import app.scene.event.participant.ParticipantPins;
import app.scene.event.participant.ParticipantRepository;
import app.scene.event.participant.ParticipantSessionService;
import app.scene.event.participant.param.ParticipantInsert;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Public submit (DEC-078). One phone is one participant in an event. A new phone stores the
 * participant with the bcrypt hash of the chosen six-digit number and the first revision. A phone
 * that already applied becomes an edit (new revision) only when the number matches; otherwise
 * {@code APPLICATION_ALREADY_EXISTS} with no previous answers, counted as a failure for the phone.
 * Both open a participant session. A phone whose application was withdrawn comes back with the
 * matching number (DEC-084 §5). Every submit counts toward the address limit (#401). Answers are
 * checked by {@link AnswerEvaluator} (DEC-068). No audit row is written.
 */
@Service
public class PublicApplicationService {

  private static final String NAME = "NAME";
  private static final String PHONE = "PHONE";
  private static final String SUBMITTED = "SUBMITTED";
  private static final String WITHDRAWN = "WITHDRAWN";
  private static final String ACTIVE = "ACTIVE";

  private final EventRepository events;
  private final FormRepository forms;
  private final ApplicationRepository applications;
  private final ApplicationRevisions revisions;
  private final ApplicationStatusChanges statuses;
  private final ParticipantRepository participants;
  private final ParticipantSessionService sessions;
  private final ParticipantPins pins;
  private final ParticipantGuard guard;
  private final Clock clock;
  private final JsonMapper json;
  private final ApplicationNotices notices;

  public PublicApplicationService(
      EventRepository events,
      FormRepository forms,
      ApplicationRepository applications,
      ApplicationRevisions revisions,
      ApplicationStatusChanges statuses,
      ParticipantRepository participants,
      ParticipantSessionService sessions,
      ParticipantPins pins,
      ParticipantGuard guard,
      Clock clock,
      JsonMapper json,
      ApplicationNotices notices) {
    this.events = events;
    this.forms = forms;
    this.applications = applications;
    this.revisions = revisions;
    this.statuses = statuses;
    this.participants = participants;
    this.sessions = sessions;
    this.pins = pins;
    this.guard = guard;
    this.clock = clock;
    this.json = json;
    this.notices = notices;
  }

  /** The response body, the raw session token for the cookie, and whether a participant is new. */
  public record Submission(
      SubmittedApplication body, ParticipantSessionService.Issued session, boolean created) {}

  @Transactional
  public Submission submit(UUID eventId, UUID formId, JsonNode body, String address) {
    guard.submitted(eventId, address);
    EventLocation location =
        events
            .findLocation(eventId)
            .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
    UUID spaceId = location.spaceId();
    FormRow form =
        forms
            .find(spaceId, eventId, formId)
            .orElseThrow(() -> new SceneException(ErrorCode.FORM_NOT_FOUND));
    if (!form.acceptingApplications()) {
      throw new SceneException(ErrorCode.FORM_CLOSED);
    }
    List<FieldDefinition> fields = fields(spaceId, eventId, formId);
    String pin = pin(body);
    List<AnswerEvaluator.Answer> answers = AnswerEvaluator.evaluate(withoutPin(body), fields);
    String name = required(answers, NAME).text();
    String phone = required(answers, PHONE).text();
    String phoneKey = ParticipantPins.phoneKey(phone);
    Optional<ParticipantIdentity> existing =
        participants.findByPhoneKey(spaceId, eventId, phoneKey);
    if (existing.isPresent()) {
      return resubmit(location, form, fields, answers, existing.get(), phoneKey, pin, address);
    }
    ParticipantPins.requireAccepted(pin, ParticipantPins.digits(phone));
    Instant now = clock.instant();
    UUID participantId = UUID.randomUUID();
    UUID applicationId = UUID.randomUUID();
    String digits = ParticipantPins.digits(phone);
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
              pins.hash(pin),
              now,
              now));
    } catch (DuplicateKeyException exception) {
      throw new SceneException(ErrorCode.APPLICATION_ALREADY_EXISTS);
    }
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
    ParticipantSessionService.Issued token = sessions.open(spaceId, eventId, participantId);
    return new Submission(
        new SubmittedApplication(
            applicationId, participantId, 1, false, form.completionNotice(), false),
        token,
        true);
  }

  private Submission resubmit(
      EventLocation location,
      FormRow form,
      List<FieldDefinition> fields,
      List<AnswerEvaluator.Answer> answers,
      ParticipantIdentity participant,
      String phoneKey,
      String pin,
      String address) {
    UUID eventId = location.id();
    guard.requirePhoneOpen(eventId, phoneKey);
    if (!pins.matches(pin, participant.pinHash())) {
      guard.failed(eventId, phoneKey, address);
      throw new SceneException(ErrorCode.APPLICATION_ALREADY_EXISTS);
    }
    guard.succeeded(eventId, phoneKey);
    if (participant.applicationId() == null) {
      return reapply(location, form, fields, answers, participant);
    }
    if (!ACTIVE.equals(location.lifecycleStatus()) || !form.acceptingEdits()) {
      throw new SceneException(ErrorCode.EDITS_CLOSED);
    }
    ApplicationRevisionRow current =
        revisions.lockCurrent(location.spaceId(), eventId, participant.id());
    ApplicationRevisions.Result result =
        revisions.revise(
            location.spaceId(),
            eventId,
            current,
            fields,
            answers,
            participant.name(),
            ApplicationRevisions.BY_PARTICIPANT,
            null);
    // DEC-080 §7.2: an edit through a resubmit is its own kind, in this transaction.
    notices.resubmitted(location.spaceId(), eventId, result);
    ParticipantSessionService.Issued token =
        sessions.open(location.spaceId(), eventId, participant.id());
    return new Submission(
        new SubmittedApplication(
            result.applicationId(),
            participant.id(),
            result.revision(),
            true,
            form.completionNotice(),
            false),
        token,
        false);
  }

  /**
   * A withdrawn participant applies again with the matching number (DEC-084 §5). Changed answers
   * become a new revision and the withdrawn row turns {@code SUPERSEDED}; the same answers turn the
   * withdrawn row back to {@code SUBMITTED}. The group does not come back. The form being open is
   * enough: this is applying, so the edit switch is not read. A participant with no withdrawn row
   * keeps the old answer {@code APPLICATION_ALREADY_EXISTS}.
   */
  private Submission reapply(
      EventLocation location,
      FormRow form,
      List<FieldDefinition> fields,
      List<AnswerEvaluator.Answer> answers,
      ParticipantIdentity participant) {
    UUID spaceId = location.spaceId();
    UUID eventId = location.id();
    ApplicationRevisionRow latest = revisions.lockLatest(spaceId, eventId, participant.id());
    if (latest == null || !WITHDRAWN.equals(latest.status())) {
      throw new SceneException(ErrorCode.APPLICATION_ALREADY_EXISTS);
    }
    ApplicationRevisions.Result result =
        revisions.revise(
            spaceId,
            eventId,
            latest,
            fields,
            answers,
            participant.name(),
            ApplicationRevisions.BY_PARTICIPANT,
            null);
    if (!result.revised()) {
      try {
        if (!statuses.setStatus(spaceId, eventId, latest.applicationId(), WITHDRAWN, SUBMITTED)) {
          throw new SceneException(ErrorCode.APPLICATION_ALREADY_EXISTS);
        }
      } catch (DuplicateKeyException exception) {
        throw new SceneException(ErrorCode.CONFLICT);
      }
    }
    statuses.record(
        new ApplicationStatusChanged(
            spaceId,
            eventId,
            participant.id(),
            result.applicationId(),
            ApplicationStatusChanged.RESTORED,
            ApplicationStatusChanged.BY_PARTICIPANT,
            null,
            clock.instant()),
        null,
        false);
    ParticipantSessionService.Issued token = sessions.open(spaceId, eventId, participant.id());
    return new Submission(
        new SubmittedApplication(
            result.applicationId(),
            participant.id(),
            result.revision(),
            true,
            form.completionNotice(),
            true),
        token,
        false);
  }

  private List<FieldDefinition> fields(UUID spaceId, UUID eventId, UUID formId) {
    List<FieldDefinition> fields = new ArrayList<>();
    for (FormFieldRow row : forms.findFields(spaceId, eventId, formId)) {
      fields.add(FieldDefinition.from(row, json));
    }
    return fields;
  }

  /** The chosen number, or null when it is missing or not a string. */
  private static String pin(JsonNode body) {
    if (body == null || !body.isObject()) {
      return null;
    }
    JsonNode pin = body.get("pin");
    return pin != null && pin.isString() ? pin.asString().strip() : null;
  }

  /** The body the evaluator reads: the same object without {@code pin}. */
  private static JsonNode withoutPin(JsonNode body) {
    if (body == null || !body.isObject() || !body.has("pin")) {
      return body;
    }
    ObjectNode copy = ((ObjectNode) body).deepCopy();
    copy.remove("pin");
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
