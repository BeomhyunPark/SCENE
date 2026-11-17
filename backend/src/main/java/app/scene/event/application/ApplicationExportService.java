package app.scene.event.application;

import app.scene.common.audit.AuditActions;
import app.scene.common.audit.AuditLogRepository;
import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.permission.Permission;
import app.scene.common.permission.PermissionEvaluator;
import app.scene.event.form.FormFieldRow;
import app.scene.event.form.FormRepository;
import app.scene.event.form.FormRow;
import app.scene.event.lifecycle.EventAccessGate;
import app.scene.event.lifecycle.EventLocation;
import app.scene.event.lifecycle.EventProfile;
import app.scene.event.lifecycle.EventRepository;
import app.scene.space.EventUserPermissionRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Applicant list as one CSV file (#233). Only effective {@code DATA_EXPORT} on the event downloads
 * (DEC-054): the event OWNER by default, or an operator with a personal GRANT. {@code EVENT_READ}
 * alone, and a space OWNER or ADMIN without that key, get {@code 403 FORBIDDEN}. Every lifecycle
 * state downloads, ARCHIVED included (DEC-061).
 *
 * <p>The file is built and sent in the same request, so the permission is checked at each download.
 * The separate create job, purpose choice, re-authentication and expiring link of #12 are not
 * built. Each download writes one {@code APPLICATIONS_EXPORTED} audit row whose detail is the row
 * count only. No answer, name or phone goes to the audit row (DEC-055).
 */
@Service
public class ApplicationExportService {

  /** Same zone as the operator list's submit time. */
  static final ZoneId EVENT_ZONE = ZoneId.of("Asia/Seoul");

  static final String SUBMITTED_AT = "제출 시각";

  private static final DateTimeFormatter SUBMITTED_FORMAT =
      DateTimeFormatter.ofPattern("yyyy. M. d. HH:mm").withZone(EVENT_ZONE);
  private static final DateTimeFormatter FILE_DATE =
      DateTimeFormatter.ofPattern("yyyyMMdd-HHmm").withZone(EVENT_ZONE);
  private static final int FILE_NAME_MAX = 60;

  private final EventAccessGate gate;
  private final EventRepository events;
  private final FormRepository forms;
  private final ApplicationRepository applications;
  private final EventUserPermissionRepository permissions;
  private final AuditLogRepository auditLogs;
  private final JsonMapper json;
  private final Clock clock;

  public ApplicationExportService(
      EventAccessGate gate,
      EventRepository events,
      FormRepository forms,
      ApplicationRepository applications,
      EventUserPermissionRepository permissions,
      AuditLogRepository auditLogs,
      JsonMapper json,
      Clock clock) {
    this.gate = gate;
    this.events = events;
    this.forms = forms;
    this.applications = applications;
    this.permissions = permissions;
    this.auditLogs = auditLogs;
    this.json = json;
    this.clock = clock;
  }

  /** One downloaded file. {@code count} is the number of applicant rows. */
  public record ExportFile(String fileName, byte[] body, int count) {}

  @Transactional
  public ExportFile export(UUID actorId, UUID eventId) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (!allows(opened, actorId, Permission.DATA_EXPORT)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    UUID spaceId = opened.location().spaceId();
    List<FormFieldRow> fields =
        forms
            .findByEvent(spaceId, eventId)
            .map(FormRow::id)
            .map(formId -> forms.findFields(spaceId, eventId, formId))
            .orElse(List.of());
    List<ApplicationRow> rows = applications.listSubmitted(spaceId, eventId);
    Map<UUID, Map<UUID, String>> answers = new HashMap<>();
    for (ExportAnswerRow answer : applications.listSubmittedAnswers(spaceId, eventId)) {
      answers
          .computeIfAbsent(answer.applicationId(), id -> new HashMap<>())
          .put(answer.fieldId(), answer.value());
    }

    List<JsonNode> configs = new ArrayList<>();
    List<String> header = new ArrayList<>();
    header.add(SUBMITTED_AT);
    for (FormFieldRow field : fields) {
      header.add(AnswerText.label(field.label(), field.hidden()));
      configs.add(field.config() == null ? null : json.readTree(field.config()));
    }
    List<List<String>> table = new ArrayList<>();
    table.add(header);
    for (ApplicationRow row : rows) {
      Map<UUID, String> stored = answers.getOrDefault(row.applicationId(), Map.of());
      List<String> line = new ArrayList<>();
      line.add(row.submittedAt() == null ? "" : SUBMITTED_FORMAT.format(row.submittedAt()));
      for (int i = 0; i < fields.size(); i++) {
        FormFieldRow field = fields.get(i);
        String value = stored.get(field.fieldId());
        line.add(
            value == null
                ? ""
                : AnswerText.format(field.answerType(), configs.get(i), json.readTree(value)));
      }
      table.add(line);
    }

    Instant now = clock.instant();
    auditLogs.save(
        spaceId,
        eventId,
        actorId,
        AuditActions.APPLICATIONS_EXPORTED,
        "{\"count\":" + rows.size() + "}",
        now);
    String eventName = events.findProfile(eventId).map(EventProfile::name).orElse("");
    return new ExportFile(fileName(eventName, now), ApplicationCsv.write(table), rows.size());
  }

  /** {@code 행사이름_신청자_20261117-1430.csv}. Path and control characters are dropped. */
  static String fileName(String eventName, Instant now) {
    String cleaned =
        eventName == null
            ? ""
            : eventName.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "").replaceAll("\\s+", " ").trim();
    if (cleaned.length() > FILE_NAME_MAX) {
      cleaned = cleaned.substring(0, FILE_NAME_MAX).trim();
    }
    String stamp = FILE_DATE.format(now);
    return cleaned.isEmpty() ? "신청자_" + stamp + ".csv" : cleaned + "_신청자_" + stamp + ".csv";
  }

  private boolean allows(EventAccessGate.Opened opened, UUID actorId, Permission permission) {
    if (opened.eventRole() == null) {
      return false;
    }
    EventLocation location = opened.location();
    String effect =
        permissions
            .findEffect(location.spaceId(), location.id(), actorId, permission.name())
            .orElse(null);
    return PermissionEvaluator.allows(
        permission, opened.eventRole(), opened.authorityEnded(), effect);
  }
}
