package app.scene.event.application;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.event.form.FieldDefinition;
import app.scene.event.form.FormFieldRow;
import app.scene.event.form.FormFieldView;
import app.scene.event.form.FormRepository;
import app.scene.event.form.FormRow;
import app.scene.event.lifecycle.EventLocation;
import app.scene.event.lifecycle.EventRepository;
import app.scene.event.participant.ParticipantIdentity;
import app.scene.event.participant.ParticipantPins;
import app.scene.event.participant.ParticipantRepository;
import app.scene.event.participant.ParticipantSelf;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * The participant reads and edits their own application (DEC-078 §4, #402). Edits are open when the
 * event is {@code ACTIVE} and the form accepts edits; otherwise {@code EDITS_CLOSED}. A stale
 * {@code expectedRevision} is {@code CONCURRENT_MODIFICATION} with the current revision. The phone
 * stays the same (it is the identity). The answers are checked like a public submit.
 */
@Service
public class ParticipantApplicationService {

  private static final String ACTIVE = "ACTIVE";
  private static final String PHONE = "PHONE";

  private final EventRepository events;
  private final FormRepository forms;
  private final ApplicationRepository applications;
  private final ApplicationRevisions revisions;
  private final ParticipantRepository participants;
  private final JsonMapper json;
  private final ApplicationNotices notices;

  public ParticipantApplicationService(
      EventRepository events,
      FormRepository forms,
      ApplicationRepository applications,
      ApplicationRevisions revisions,
      ParticipantRepository participants,
      JsonMapper json,
      ApplicationNotices notices) {
    this.events = events;
    this.forms = forms;
    this.applications = applications;
    this.revisions = revisions;
    this.participants = participants;
    this.json = json;
    this.notices = notices;
  }

  public ParticipantApplication read(ParticipantSelf self) {
    ApplicationRevisionRow current =
        revisions.findCurrent(self.spaceId(), self.eventId(), self.participantId());
    if (current == null) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    return view(self, current);
  }

  @Transactional
  public ParticipantApplication edit(ParticipantSelf self, JsonNode body) {
    int expected = expectedRevision(body);
    EventLocation location =
        events
            .findLocation(self.eventId())
            .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
    ApplicationRevisionRow current =
        revisions.lockCurrent(self.spaceId(), self.eventId(), self.participantId());
    FormRow form = form(self, current.formId());
    if (!editsOpen(location, form)) {
      throw new SceneException(ErrorCode.EDITS_CLOSED);
    }
    if (current.revision() != expected) {
      throw new SceneException(
          ErrorCode.CONCURRENT_MODIFICATION, Map.of("revision", current.revision()));
    }
    List<FieldDefinition> fields = fields(self, current.formId());
    List<AnswerEvaluator.Answer> answers = AnswerEvaluator.evaluate(answersOnly(body), fields);
    ParticipantIdentity participant =
        participants
            .findById(self.spaceId(), self.eventId(), self.participantId())
            .orElseThrow(() -> new SceneException(ErrorCode.AUTHENTICATION_REQUIRED));
    for (AnswerEvaluator.Answer answer : answers) {
      if (PHONE.equals(answer.systemKey())
          && !ParticipantPins.digits(answer.text())
              .equals(ParticipantPins.digits(participant.phone()))) {
        throw new SceneException(ErrorCode.APPLICATION_VALIDATION_FAILED);
      }
    }
    ApplicationRevisions.Result result =
        revisions.revise(
            self.spaceId(),
            self.eventId(),
            current,
            fields,
            answers,
            participant.name(),
            ApplicationRevisions.BY_PARTICIPANT,
            null);
    // DEC-080 §7.2: operators with PARTICIPANT_READ learn of it, in this transaction.
    notices.revised(self.spaceId(), self.eventId(), result);
    ApplicationRevisionRow stored =
        result.revised()
            ? revisions.findCurrent(self.spaceId(), self.eventId(), self.participantId())
            : current;
    return view(self, stored);
  }

  private ParticipantApplication view(ParticipantSelf self, ApplicationRevisionRow current) {
    EventLocation location =
        events
            .findLocation(self.eventId())
            .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
    FormRow form = form(self, current.formId());
    List<FormFieldView> views = new ArrayList<>();
    Set<UUID> visible = new HashSet<>();
    for (FieldDefinition field : fields(self, current.formId())) {
      if (!field.hidden()) {
        views.add(field.publicView());
        visible.add(field.fieldId());
      }
    }
    List<ParticipantApplication.Answer> answers = new ArrayList<>();
    for (ApplicationAnswerRow row :
        applications.findAnswers(self.spaceId(), self.eventId(), current.applicationId())) {
      if (visible.contains(row.fieldId())) {
        answers.add(new ParticipantApplication.Answer(row.fieldId(), json.readTree(row.value())));
      }
    }
    return new ParticipantApplication(
        current.applicationId(),
        current.formId(),
        current.revision(),
        current.submittedAt(),
        editsOpen(location, form),
        views,
        answers);
  }

  private static boolean editsOpen(EventLocation location, FormRow form) {
    return ACTIVE.equals(location.lifecycleStatus()) && form.acceptingEdits();
  }

  private FormRow form(ParticipantSelf self, UUID formId) {
    return forms
        .find(self.spaceId(), self.eventId(), formId)
        .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
  }

  private List<FieldDefinition> fields(ParticipantSelf self, UUID formId) {
    List<FieldDefinition> fields = new ArrayList<>();
    for (FormFieldRow row : forms.findFields(self.spaceId(), self.eventId(), formId)) {
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

  private static JsonNode answersOnly(JsonNode body) {
    ObjectNode copy = ((ObjectNode) body).deepCopy();
    copy.remove("expectedRevision");
    return copy;
  }
}
