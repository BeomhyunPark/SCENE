package app.scene.event.application;

import app.scene.common.audit.AuditActions;
import app.scene.common.audit.AuditLogRepository;
import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.permission.Permission;
import app.scene.common.permission.PermissionEvaluator;
import app.scene.common.web.ItemPage;
import app.scene.common.web.PageRequest;
import app.scene.common.web.Sorts;
import app.scene.event.lifecycle.EventAccessGate;
import app.scene.event.lifecycle.EventLocation;
import app.scene.space.EventUserPermissionRepository;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Operator reads of submitted application source. §7 names {@code APPLICATION_READ} for these
 * routes. That key is already in the permission catalog and is not checked here. Both reads use
 * effective {@code EVENT_READ}, the same allowance as form read. Public submit, revision, and
 * withdraw are elsewhere ({@link ApplicationWithdrawalService}). {@code FORM_CLOSED} and {@code
 * APPLICATION_CLOSED} are not returned. The list writes nothing. The detail sends phone answers
 * only with effective {@code PARTICIPANT_CONTACT_READ}, the applicant table's rule (#308, #332),
 * and then writes one {@code APPLICANT_CONTACTS_VIEWED} audit row ({@code count: 1}, {@code
 * applicationId}) as the stand-in for the {@code CONTACT_VIEW} privacy log. {@code Idempotency-Key}
 * is not read.
 */
@Service
public class OperatorApplicationService {

  private static final Set<String> STATUSES = Set.of("SUBMITTED", "SUPERSEDED", "WITHDRAWN");

  private final EventAccessGate gate;
  private final ApplicationRepository applications;
  private final EventUserPermissionRepository permissions;
  private final ApplicationOperationRepository operations;
  private final AuditLogRepository auditLogs;
  private final JsonMapper json;
  private final Clock clock;
  private final ApplicationRevisions revisions;
  private final ApplicationStatusChanges statuses;

  public OperatorApplicationService(
      EventAccessGate gate,
      ApplicationRepository applications,
      EventUserPermissionRepository permissions,
      ApplicationOperationRepository operations,
      AuditLogRepository auditLogs,
      JsonMapper json,
      Clock clock,
      ApplicationRevisions revisions,
      ApplicationStatusChanges statuses) {
    this.revisions = revisions;
    this.statuses = statuses;
    this.gate = gate;
    this.applications = applications;
    this.permissions = permissions;
    this.operations = operations;
    this.auditLogs = auditLogs;
    this.json = json;
    this.clock = clock;
  }

  public ItemPage<ApplicationListItem> list(
      UUID actorId,
      UUID eventId,
      Integer page,
      Integer size,
      List<String> sort,
      List<String> status) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (!mayRead(opened, actorId)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    PageRequest request = PageRequest.of(page, size);
    Sorts.parse(sort, Set.of());
    validateStatus(status);
    UUID spaceId = opened.location().spaceId();
    long total = applications.count(spaceId, eventId);
    List<ApplicationListItem> items = new ArrayList<>();
    for (ApplicationRow row : applications.list(spaceId, eventId, request)) {
      items.add(item(row));
    }
    return ItemPage.of(items, request, total);
  }

  @Transactional
  public ApplicationDetail read(UUID actorId, UUID eventId, UUID applicationId) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    UUID spaceId = opened.location().spaceId();
    if (applications.find(spaceId, eventId, applicationId).isEmpty()) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    if (!mayRead(opened, actorId)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    boolean contactVisible = allows(opened, actorId, Permission.PARTICIPANT_CONTACT_READ);
    ApplicationRow row =
        applications
            .find(spaceId, eventId, applicationId)
            .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
    ApplicationRevisionRow revision = revisions.find(spaceId, eventId, applicationId);
    List<ApplicationAnswer> answers = new ArrayList<>();
    boolean contactSent = false;
    for (ApplicationAnswerRow answer : applications.findAnswers(spaceId, eventId, applicationId)) {
      JsonNode config = json.readTree(answer.config());
      boolean contact =
          ApplicationTableService.isPhone(answer.systemKey(), answer.answerType(), config);
      JsonNode value = contact && !contactVisible ? null : json.readTree(answer.value());
      contactSent |= contact && value != null;
      answers.add(
          new ApplicationAnswer(
              answer.fieldId(),
              answer.kind(),
              answer.systemKey(),
              answer.label(),
              answer.position(),
              answer.answerType(),
              answer.hidden(),
              config,
              value,
              contact));
    }
    if (contactSent) {
      auditLogs.save(
          spaceId,
          eventId,
          actorId,
          AuditActions.APPLICANT_CONTACTS_VIEWED,
          "{\"count\":1,\"applicationId\":\"" + applicationId + "\"}",
          clock.instant());
    }
    return new ApplicationDetail(
        row.applicationId(),
        row.formId(),
        row.status(),
        row.submittedAt(),
        contactVisible,
        answers,
        operations.find(spaceId, eventId, applicationId),
        revision.participantId(),
        revision.revision(),
        statuses
            .withdrawn(spaceId, eventId, applicationId)
            .map(WithdrawnRow::withdrawal)
            .orElse(null));
  }

  /**
   * Every revision of the application's participant, newest first (DEC-078 §4). Same access as the
   * detail. {@code changes} name the changed questions with the label of that time; no values.
   */
  public ApplicationRevisionList revisions(UUID actorId, UUID eventId, UUID applicationId) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    UUID spaceId = opened.location().spaceId();
    if (applications.find(spaceId, eventId, applicationId).isEmpty()) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    if (!mayRead(opened, actorId)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    List<ApplicationRevisionList.Item> items = new ArrayList<>();
    for (ApplicationRevisionRow row :
        revisions.listByApplication(spaceId, eventId, applicationId)) {
      items.add(
          new ApplicationRevisionList.Item(
              row.applicationId(),
              row.revision(),
              row.status(),
              row.submittedAt(),
              row.revisedBy(),
              row.revisedByUserId(),
              json.readTree(row.changes())));
    }
    return new ApplicationRevisionList(items);
  }

  /**
   * Effective {@code EVENT_READ}, or an active space owner or admin. This does not insert an
   * operator row and does not check {@code APPLICATION_READ}. The summary (#251) uses the same
   * check.
   */
  boolean mayRead(EventAccessGate.Opened opened, UUID actorId) {
    if (allows(opened, actorId, Permission.EVENT_READ)) {
      return true;
    }
    return opened.membership().seesEveryEvent();
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

  /** Known status values are accepted and are not used as a filter. */
  private static void validateStatus(List<String> status) {
    if (status == null || status.isEmpty()) {
      return;
    }
    for (String value : status) {
      if (value == null || !STATUSES.contains(value)) {
        throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "status"));
      }
    }
  }

  private static ApplicationListItem item(ApplicationRow row) {
    return new ApplicationListItem(
        row.applicationId(), row.formId(), row.status(), row.submittedAt(), row.name());
  }
}
