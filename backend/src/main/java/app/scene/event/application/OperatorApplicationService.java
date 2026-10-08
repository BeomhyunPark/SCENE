package app.scene.event.application;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.permission.Permission;
import app.scene.common.permission.PermissionEvaluator;
import app.scene.common.tenant.SpaceMembership;
import app.scene.common.web.ItemPage;
import app.scene.common.web.PageRequest;
import app.scene.common.web.Sorts;
import app.scene.event.lifecycle.EventAccessGate;
import app.scene.event.lifecycle.EventLocation;
import app.scene.space.EventUserPermissionRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

/**
 * Operator reads of submitted application source. §7 names {@code APPLICATION_READ} for these
 * routes. That key is already in the permission catalog and is not checked here. Both reads use
 * effective {@code EVENT_READ}, the same allowance as form read. Public submit, revision, and
 * withdraw stay closed. {@code FORM_CLOSED} and {@code APPLICATION_CLOSED} are not returned. No
 * audit action and no privacy log are written. {@code Idempotency-Key} is not read.
 */
@Service
public class OperatorApplicationService {

  private static final Set<String> STATUSES = Set.of("SUBMITTED", "SUPERSEDED", "WITHDRAWN");

  private final EventAccessGate gate;
  private final ApplicationRepository applications;
  private final EventUserPermissionRepository permissions;
  private final JsonMapper json;

  public OperatorApplicationService(
      EventAccessGate gate,
      ApplicationRepository applications,
      EventUserPermissionRepository permissions,
      JsonMapper json) {
    this.gate = gate;
    this.applications = applications;
    this.permissions = permissions;
    this.json = json;
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

  public ApplicationDetail read(UUID actorId, UUID eventId, UUID applicationId) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    UUID spaceId = opened.location().spaceId();
    if (applications.find(spaceId, eventId, applicationId).isEmpty()) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    if (!mayRead(opened, actorId)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    ApplicationRow row =
        applications
            .find(spaceId, eventId, applicationId)
            .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
    List<ApplicationAnswer> answers = new ArrayList<>();
    for (ApplicationAnswerRow answer : applications.findAnswers(spaceId, eventId, applicationId)) {
      answers.add(
          new ApplicationAnswer(
              answer.fieldId(),
              answer.kind(),
              answer.systemKey(),
              answer.label(),
              answer.position(),
              json.readTree(answer.value())));
    }
    return new ApplicationDetail(
        row.applicationId(), row.formId(), row.status(), row.submittedAt(), answers);
  }

  /**
   * Effective {@code EVENT_READ}, or an active space owner or admin. This does not insert an
   * operator row and does not check {@code APPLICATION_READ}.
   */
  private boolean mayRead(EventAccessGate.Opened opened, UUID actorId) {
    if (allows(opened, actorId, Permission.EVENT_READ)) {
      return true;
    }
    SpaceMembership membership = opened.membership();
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
        row.applicationId(), row.formId(), row.status(), row.submittedAt());
  }
}
