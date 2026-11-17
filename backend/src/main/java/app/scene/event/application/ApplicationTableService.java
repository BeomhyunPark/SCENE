package app.scene.event.application;

import app.scene.common.audit.AuditActions;
import app.scene.common.audit.AuditLogRepository;
import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.permission.Permission;
import app.scene.common.permission.PermissionEvaluator;
import app.scene.common.tenant.SpaceMembership;
import app.scene.event.application.mapper.ApplicationTableMapper;
import app.scene.event.application.param.EventApplicationKey;
import app.scene.event.form.FormFieldRow;
import app.scene.event.form.FormRepository;
import app.scene.event.form.FormRow;
import app.scene.event.lifecycle.EventAccessGate;
import app.scene.event.lifecycle.EventLocation;
import app.scene.space.EventUserPermissionRepository;
import java.time.Clock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Applicant table, the 참가 현황 screen (#308). Who reads it is the same as the list and the detail:
 * effective {@code EVENT_READ}, or an active space OWNER or ADMIN. It writes no file, so it is not
 * an export and does not need {@code DATA_EXPORT}; the CSV still does (DEC-054).
 *
 * <ul>
 *   <li>Phone questions (SYSTEM {@code PHONE}, or a text question with {@code format: PHONE}) are
 *       columns only for effective {@code PARTICIPANT_CONTACT_READ}. Without it the columns and
 *       their answers are not sent. When they are sent, one {@code APPLICANT_CONTACTS_VIEWED} audit
 *       row records the count, the interim stand-in for the {@code CONTACT_VIEW} privacy log that
 *       is not built yet (security-privacy §5).
 *   <li>Group is the working copy (DEC-072 §7): {@code GROUP_WRITE}, or an active space OWNER or
 *       ADMIN. Others get no group.
 *   <li>Check-in is the arrival time, readable with the same access as the roster (DEC-071).
 * </ul>
 *
 * Rows are the submitted applications in list order, the same rows as the CSV.
 */
@Service
public class ApplicationTableService {

  private final EventAccessGate gate;
  private final FormRepository forms;
  private final ApplicationRepository applications;
  private final ApplicationTableMapper tables;
  private final EventUserPermissionRepository permissions;
  private final AuditLogRepository auditLogs;
  private final JsonMapper json;
  private final Clock clock;

  public ApplicationTableService(
      EventAccessGate gate,
      FormRepository forms,
      ApplicationRepository applications,
      ApplicationTableMapper tables,
      EventUserPermissionRepository permissions,
      AuditLogRepository auditLogs,
      JsonMapper json,
      Clock clock) {
    this.gate = gate;
    this.forms = forms;
    this.applications = applications;
    this.tables = tables;
    this.permissions = permissions;
    this.auditLogs = auditLogs;
    this.json = json;
    this.clock = clock;
  }

  @Transactional
  public ApplicationTable read(UUID actorId, UUID eventId) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    boolean spaceAdmin = spaceAdmin(opened.membership());
    if (!allows(opened, actorId, Permission.EVENT_READ) && !spaceAdmin) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    boolean contactVisible = allows(opened, actorId, Permission.PARTICIPANT_CONTACT_READ);
    boolean groupVisible = allows(opened, actorId, Permission.GROUP_WRITE) || spaceAdmin;
    UUID spaceId = opened.location().spaceId();

    UUID formId = forms.findByEvent(spaceId, eventId).map(FormRow::id).orElse(null);
    List<FormFieldRow> fields =
        formId == null ? List.of() : forms.findFields(spaceId, eventId, formId);
    List<ApplicationTable.Column> columns = new ArrayList<>();
    Set<UUID> shown = new HashSet<>();
    boolean anyContact = false;
    for (FormFieldRow field : fields) {
      JsonNode config = field.config() == null ? null : json.readTree(field.config());
      boolean contact = isPhone(field, config);
      if (contact && !contactVisible) {
        continue;
      }
      anyContact |= contact;
      shown.add(field.fieldId());
      columns.add(
          new ApplicationTable.Column(
              field.fieldId(),
              field.kind(),
              field.systemKey(),
              field.presetKey(),
              field.label(),
              field.position(),
              field.answerType(),
              field.hidden(),
              config,
              contact));
    }

    Map<UUID, Map<UUID, JsonNode>> answers = new HashMap<>();
    for (ExportAnswerRow answer : applications.listSubmittedAnswers(spaceId, eventId)) {
      if (!shown.contains(answer.fieldId())) {
        continue;
      }
      answers
          .computeIfAbsent(answer.applicationId(), id -> new LinkedHashMap<>())
          .put(answer.fieldId(), json.readTree(answer.value()));
    }
    Map<UUID, ApplicationTableState> states = new HashMap<>();
    for (ApplicationTableState state :
        tables.findStates(EventApplicationKey.of(spaceId, eventId))) {
      states.put(state.applicationId(), state);
    }

    List<ApplicationTable.Row> rows = new ArrayList<>();
    for (ApplicationRow row : applications.listSubmitted(spaceId, eventId)) {
      ApplicationTableState state = states.get(row.applicationId());
      ApplicationTable.Group group =
          groupVisible && state != null && state.groupId() != null
              ? new ApplicationTable.Group(state.groupId(), state.groupName(), state.leader())
              : null;
      rows.add(
          new ApplicationTable.Row(
              row.applicationId(),
              row.submittedAt(),
              answers.getOrDefault(row.applicationId(), Map.of()),
              group,
              state == null ? null : state.checkedInAt()));
    }

    if (anyContact && !rows.isEmpty()) {
      auditLogs.save(
          spaceId,
          eventId,
          actorId,
          AuditActions.APPLICANT_CONTACTS_VIEWED,
          "{\"count\":" + rows.size() + "}",
          clock.instant());
    }
    return new ApplicationTable(formId, anyContact, groupVisible, columns, rows);
  }

  static boolean isPhone(FormFieldRow field, JsonNode config) {
    if ("PHONE".equals(field.systemKey())) {
      return true;
    }
    boolean text =
        "SHORT_TEXT".equals(field.answerType()) || "LONG_TEXT".equals(field.answerType());
    return text
        && config != null
        && config.path("format").isString()
        && "PHONE".equals(config.get("format").asString());
  }

  private static boolean spaceAdmin(SpaceMembership membership) {
    return membership.kind() == SpaceMembership.Kind.ACTIVE
        && ("OWNER".equals(membership.role()) || "ADMIN".equals(membership.role()));
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
