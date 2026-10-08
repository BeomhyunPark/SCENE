package app.scene.event.application;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.event.application.param.AnswerInsert;
import app.scene.event.application.param.ApplicationInsert;
import app.scene.event.form.FormFieldRow;
import app.scene.event.form.FormRepository;
import app.scene.event.form.FormRow;
import app.scene.event.lifecycle.EventLocation;
import app.scene.event.lifecycle.EventRepository;
import app.scene.event.participant.Digests;
import app.scene.event.participant.ParticipantRepository;
import app.scene.event.participant.param.ParticipantAccessInsert;
import app.scene.event.participant.param.ParticipantInsert;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Public first submit. §7 names audit in the same transaction and does not name an action, so this
 * slice writes no audit row. {@code Idempotency-Key} is ignored. A second submit with the same
 * phone creates another participant. {@code FORM_CLOSED} and {@code APPLICATION_CLOSED} stay
 * separate. This slice returns only {@code FORM_CLOSED}.
 */
@Service
public class PublicApplicationService {

  private static final int TEXT_MAX = 200;
  private static final int PHONE_MAX = 50;
  private static final int KEY_BYTES = 32;
  private static final String SYSTEM = "SYSTEM";
  private static final String NAME = "NAME";
  private static final String PHONE = "PHONE";
  private static final String SUBMITTED = "SUBMITTED";

  private final EventRepository events;
  private final FormRepository forms;
  private final ApplicationRepository applications;
  private final ParticipantRepository participants;
  private final Clock clock;
  private final JsonMapper json;
  private final SecureRandom random = new SecureRandom();

  public PublicApplicationService(
      EventRepository events,
      FormRepository forms,
      ApplicationRepository applications,
      ParticipantRepository participants,
      Clock clock,
      JsonMapper json) {
    this.events = events;
    this.forms = forms;
    this.applications = applications;
    this.participants = participants;
    this.clock = clock;
    this.json = json;
  }

  @Transactional
  public SubmittedApplication submit(UUID eventId, UUID formId, JsonNode body) {
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
    List<FormFieldRow> fields = forms.findFields(spaceId, eventId, formId);
    List<PreparedAnswer> answers = prepare(body, fields);
    PreparedAnswer name = required(answers, NAME);
    PreparedAnswer phone = required(answers, PHONE);
    String phoneText = phone.text();
    if (phoneText.length() > PHONE_MAX || digits(phoneText).length() < 4) {
      throw invalid();
    }
    Instant now = clock.instant();
    UUID participantId = UUID.randomUUID();
    UUID applicationId = UUID.randomUUID();
    String accessKey = newAccessKey();
    participants.save(
        ParticipantInsert.of(
            participantId,
            spaceId,
            eventId,
            name.text(),
            phoneText,
            Digests.sha256Hex(phoneText),
            digits(phoneText).substring(digits(phoneText).length() - 4),
            now,
            now));
    List<AnswerInsert> rows = new ArrayList<>();
    for (PreparedAnswer answer : answers) {
      rows.add(
          AnswerInsert.of(
              UUID.randomUUID(),
              spaceId,
              eventId,
              applicationId,
              answer.fieldId(),
              json.writeValueAsString(Map.of("text", answer.text()))));
    }
    applications.save(
        ApplicationInsert.of(
            applicationId, spaceId, eventId, formId, participantId, SUBMITTED, now),
        rows);
    participants.saveAccess(
        ParticipantAccessInsert.of(
            UUID.randomUUID(), spaceId, eventId, participantId, Digests.sha256Hex(accessKey), now));
    return new SubmittedApplication(applicationId, participantId, accessKey);
  }

  /** Name and phone are required. A custom field may be omitted. */
  private List<PreparedAnswer> prepare(JsonNode body, List<FormFieldRow> fields) {
    Map<UUID, String> submitted = readAnswers(body);
    List<PreparedAnswer> prepared = new ArrayList<>();
    for (FormFieldRow field : fields) {
      String text = submitted.remove(field.fieldId());
      if (text == null) {
        if (SYSTEM.equals(field.kind())) {
          throw invalid();
        }
        continue;
      }
      if (text.isEmpty() || text.length() > TEXT_MAX) {
        throw invalid();
      }
      prepared.add(new PreparedAnswer(field.fieldId(), field.systemKey(), text));
    }
    if (!submitted.isEmpty()) {
      throw invalid();
    }
    return prepared;
  }

  private Map<UUID, String> readAnswers(JsonNode body) {
    if (body == null || !body.isObject()) {
      throw invalid();
    }
    for (String key : body.propertyNames()) {
      if (!"answers".equals(key)) {
        throw invalid();
      }
    }
    JsonNode answers = body.get("answers");
    if (answers == null || !answers.isArray()) {
      throw invalid();
    }
    Map<UUID, String> submitted = new LinkedHashMap<>();
    for (JsonNode answer : answers) {
      if (answer == null || !answer.isObject()) {
        throw invalid();
      }
      for (String key : answer.propertyNames()) {
        if (!"fieldId".equals(key) && !"text".equals(key)) {
          throw invalid();
        }
      }
      JsonNode fieldId = answer.get("fieldId");
      JsonNode text = answer.get("text");
      if (fieldId == null || !fieldId.isString() || text == null || !text.isString()) {
        throw invalid();
      }
      UUID id;
      try {
        id = UUID.fromString(fieldId.asString());
      } catch (IllegalArgumentException exception) {
        throw invalid();
      }
      if (submitted.put(id, text.asString().strip()) != null) {
        throw invalid();
      }
    }
    return submitted;
  }

  private static PreparedAnswer required(List<PreparedAnswer> answers, String systemKey) {
    for (PreparedAnswer answer : answers) {
      if (systemKey.equals(answer.systemKey())) {
        return answer;
      }
    }
    throw invalid();
  }

  private static String digits(String text) {
    StringBuilder digits = new StringBuilder();
    for (int i = 0; i < text.length(); i++) {
      char character = text.charAt(i);
      if (character >= '0' && character <= '9') {
        digits.append(character);
      }
    }
    return digits.toString();
  }

  /** 256-bit key. The caller returns it once and stores only the hash. */
  private String newAccessKey() {
    byte[] bytes = new byte[KEY_BYTES];
    random.nextBytes(bytes);
    return HexFormat.of().formatHex(bytes);
  }

  private static SceneException invalid() {
    return new SceneException(ErrorCode.APPLICATION_VALIDATION_FAILED);
  }

  private record PreparedAnswer(UUID fieldId, String systemKey, String text) {}
}
