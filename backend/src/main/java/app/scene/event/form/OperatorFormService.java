package app.scene.event.form;

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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

/**
 * Operator form fields on one event. §7 leaves the open/close schema OPEN and says an error
 * boundary is not a reason to add a status column. This slice stores {@code acceptingApplications}
 * because of the 2026-10-08 call. {@code FORM_CLOSED} and {@code APPLICATION_CLOSED} are not
 * returned. {@code Idempotency-Key} is not read. No audit action is written.
 */
@Service
public class OperatorFormService {

  private static final int LABEL_MAX = 200;
  private static final String ACTIVE = "ACTIVE";
  private static final String SYSTEM = "SYSTEM";
  private static final String CUSTOM = "CUSTOM";
  private static final String NAME = "NAME";
  private static final String PHONE = "PHONE";

  private final EventAccessGate gate;
  private final FormRepository forms;
  private final EventUserPermissionRepository permissions;

  public OperatorFormService(
      EventAccessGate gate, FormRepository forms, EventUserPermissionRepository permissions) {
    this.gate = gate;
    this.forms = forms;
    this.permissions = permissions;
  }

  public ItemPage<FormListItem> list(
      UUID actorId, UUID eventId, Integer page, Integer size, List<String> sort) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (!mayRead(opened, actorId)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    PageRequest request = PageRequest.of(page, size);
    Sorts.parse(sort, Set.of());
    UUID spaceId = opened.location().spaceId();
    long total = forms.count(spaceId, eventId);
    List<FormListItem> items = new ArrayList<>();
    for (FormListRow row : forms.list(spaceId, eventId, request)) {
      items.add(new FormListItem(row.formId(), row.acceptingApplications()));
    }
    return ItemPage.of(items, request, total);
  }

  public FormDetail read(UUID actorId, UUID eventId, UUID formId) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    UUID spaceId = opened.location().spaceId();
    if (forms.find(spaceId, eventId, formId).isEmpty()) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    if (!mayRead(opened, actorId)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    return detail(spaceId, eventId, formId);
  }

  @Transactional
  public FormDetail create(UUID actorId, UUID eventId, JsonNode body) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    requireFormWrite(opened, actorId);
    String customLabel = parseCustomLabel(body);
    UUID spaceId = opened.location().spaceId();
    if (forms.findByEvent(spaceId, eventId).isPresent()) {
      throw new SceneException(ErrorCode.CONFLICT);
    }
    UUID formId = UUID.randomUUID();
    try {
      if (forms.save(formId, spaceId, eventId) != 1) {
        throw new IllegalStateException("form was not stored");
      }
      saveSystem(spaceId, eventId, formId, NAME, "이름", 0);
      saveSystem(spaceId, eventId, formId, PHONE, "전화", 1);
      if (customLabel != null) {
        saveCustom(spaceId, eventId, formId, customLabel, 2);
      }
    } catch (DataIntegrityViolationException exception) {
      throw constraint(exception);
    }
    return detail(spaceId, eventId, formId);
  }

  @Transactional
  public FormDetail updateAccepting(UUID actorId, UUID eventId, UUID formId, JsonNode body) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    UUID spaceId = opened.location().spaceId();
    if (forms.find(spaceId, eventId, formId).isEmpty()) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    requireFormWrite(opened, actorId);
    boolean accepting = parseAccepting(body);
    if (accepting && !ACTIVE.equals(opened.location().lifecycleStatus())) {
      throw new SceneException(ErrorCode.INVALID_STATE_TRANSITION);
    }
    if (forms.updateAccepting(spaceId, eventId, formId, accepting) != 1) {
      throw new IllegalStateException("form acceptance was not stored");
    }
    return detail(spaceId, eventId, formId);
  }

  @Transactional
  public FormDetail addField(UUID actorId, UUID eventId, UUID formId, JsonNode body) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    UUID spaceId = opened.location().spaceId();
    if (forms.find(spaceId, eventId, formId).isEmpty()) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    requireFormWrite(opened, actorId);
    String label = parseLabel(body);
    if (forms.countCustom(spaceId, eventId, formId) > 0) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED);
    }
    int position = forms.nextPosition(spaceId, eventId, formId);
    try {
      saveCustom(spaceId, eventId, formId, label, position);
    } catch (DataIntegrityViolationException exception) {
      throw constraint(exception);
    }
    return detail(spaceId, eventId, formId);
  }

  @Transactional
  public FormDetail renameField(
      UUID actorId, UUID eventId, UUID formId, UUID fieldId, JsonNode body) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    UUID spaceId = opened.location().spaceId();
    if (forms.find(spaceId, eventId, formId).isEmpty()
        || forms.findField(spaceId, eventId, formId, fieldId).isEmpty()) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    requireFormWrite(opened, actorId);
    String label = parseLabel(body);
    if (forms.updateLabel(spaceId, eventId, formId, fieldId, label) != 1) {
      throw new IllegalStateException("field label was not stored");
    }
    return detail(spaceId, eventId, formId);
  }

  @Transactional
  public void deleteField(UUID actorId, UUID eventId, UUID formId, UUID fieldId) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    UUID spaceId = opened.location().spaceId();
    if (forms.find(spaceId, eventId, formId).isEmpty()) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    requireFormWrite(opened, actorId);
    FormFieldRow field =
        forms
            .findField(spaceId, eventId, formId, fieldId)
            .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
    if (SYSTEM.equals(field.kind())) {
      throw new SceneException(ErrorCode.CONFLICT);
    }
    if (forms.deleteCustom(spaceId, eventId, formId, fieldId) != 1) {
      throw new IllegalStateException("custom field was not removed");
    }
  }

  private void saveSystem(
      UUID spaceId, UUID eventId, UUID formId, String systemKey, String label, int position) {
    if (forms.saveField(
            UUID.randomUUID(), spaceId, eventId, formId, SYSTEM, systemKey, label, position)
        != 1) {
      throw new IllegalStateException("system field was not stored");
    }
  }

  private void saveCustom(UUID spaceId, UUID eventId, UUID formId, String label, int position) {
    if (forms.saveField(UUID.randomUUID(), spaceId, eventId, formId, CUSTOM, null, label, position)
        != 1) {
      throw new IllegalStateException("custom field was not stored");
    }
  }

  private FormDetail detail(UUID spaceId, UUID eventId, UUID formId) {
    FormRow form =
        forms
            .find(spaceId, eventId, formId)
            .orElseThrow(() -> new IllegalStateException("form disappeared after it was written"));
    List<FormFieldView> fields = new ArrayList<>();
    for (FormFieldRow row : forms.findFields(spaceId, eventId, formId)) {
      fields.add(
          new FormFieldView(
              row.fieldId(), row.kind(), row.systemKey(), row.label(), row.position()));
    }
    return new FormDetail(form.id(), form.acceptingApplications(), fields);
  }

  /**
   * Effective {@code EVENT_READ}, or an active space owner or admin. This does not insert an
   * operator row.
   */
  private boolean mayRead(EventAccessGate.Opened opened, UUID actorId) {
    if (allows(opened, actorId, Permission.EVENT_READ)) {
      return true;
    }
    SpaceMembership membership = opened.membership();
    return membership.kind() == SpaceMembership.Kind.ACTIVE
        && ("OWNER".equals(membership.role()) || "ADMIN".equals(membership.role()));
  }

  private void requireFormWrite(EventAccessGate.Opened opened, UUID actorId) {
    if (!allows(opened, actorId, Permission.FORM_WRITE)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
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

  /** Empty body is allowed. The only field is an optional {@code customLabel}. */
  private static String parseCustomLabel(JsonNode body) {
    if (body == null || body.isNull()) {
      return null;
    }
    if (!body.isObject()) {
      throw field("customLabel");
    }
    for (String key : body.propertyNames()) {
      if (!"customLabel".equals(key)) {
        throw field(key);
      }
    }
    JsonNode label = body.get("customLabel");
    if (label == null || label.isNull()) {
      return null;
    }
    if (!label.isString()) {
      throw field("customLabel");
    }
    String trimmed = label.asString().strip();
    if (trimmed.isEmpty() || trimmed.length() > LABEL_MAX) {
      throw field("customLabel");
    }
    return trimmed;
  }

  /** The body is {@code acceptingApplications} only. */
  private static boolean parseAccepting(JsonNode body) {
    if (body == null || !body.isObject()) {
      throw field("acceptingApplications");
    }
    for (String key : body.propertyNames()) {
      if (!"acceptingApplications".equals(key)) {
        throw field(key);
      }
    }
    JsonNode value = body.get("acceptingApplications");
    if (value == null || !value.isBoolean()) {
      throw field("acceptingApplications");
    }
    return value.booleanValue();
  }

  /** The body is {@code label} only. {@code kind} and {@code systemKey} are rejected. */
  private static String parseLabel(JsonNode body) {
    if (body == null || !body.isObject()) {
      throw field("label");
    }
    for (String key : body.propertyNames()) {
      if (!"label".equals(key)) {
        throw field(key);
      }
    }
    JsonNode label = body.get("label");
    if (label == null || label.isNull() || !label.isString()) {
      throw field("label");
    }
    String trimmed = label.asString().strip();
    if (trimmed.isEmpty() || trimmed.length() > LABEL_MAX) {
      throw field("label");
    }
    return trimmed;
  }

  private static SceneException field(String name) {
    return new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", name));
  }

  private static RuntimeException constraint(DataIntegrityViolationException exception) {
    String message = exception.getMostSpecificCause().getMessage();
    if (message != null && message.contains("forms_one_per_event")) {
      return new SceneException(ErrorCode.CONFLICT);
    }
    if (message != null && message.contains("fields_one_custom")) {
      return new SceneException(ErrorCode.VALIDATION_FAILED);
    }
    return exception;
  }
}
