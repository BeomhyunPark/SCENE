package app.scene.event.form;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.permission.Permission;
import app.scene.common.permission.PermissionEvaluator;
import app.scene.common.tenant.SpaceMembership;
import app.scene.common.web.ItemPage;
import app.scene.common.web.PageRequest;
import app.scene.common.web.Sorts;
import app.scene.event.form.param.FieldValues;
import app.scene.event.lifecycle.EventAccessGate;
import app.scene.event.lifecycle.EventLocation;
import app.scene.space.EventUserPermissionRepository;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Operator form fields on one event. §7 leaves the open/close schema OPEN and says an error
 * boundary is not a reason to add a status column. This slice stores {@code acceptingApplications}
 * because of the 2026-10-08 call. {@code FORM_CLOSED} and {@code APPLICATION_CLOSED} are not
 * returned. {@code Idempotency-Key} is not read. No audit action is written. Question types,
 * settings, conditions, and edit locks follow DEC-068 through {@link FieldRules}.
 */
@Service
public class OperatorFormService {

  private static final int LABEL_MAX = FieldRules.LABEL_MAX;
  private static final String ACTIVE = "ACTIVE";
  private static final String NAME = "NAME";
  private static final String PHONE = "PHONE";
  private static final Set<String> FIELD_KEYS =
      Set.of("label", "answerType", "required", "description", "config", "showWhen", "hidden");

  private final EventAccessGate gate;
  private final FormRepository forms;
  private final EventUserPermissionRepository permissions;
  private final JsonMapper json;

  public OperatorFormService(
      EventAccessGate gate,
      FormRepository forms,
      EventUserPermissionRepository permissions,
      JsonMapper json) {
    this.gate = gate;
    this.forms = forms;
    this.permissions = permissions;
    this.json = json;
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
    if (body == null || !body.isObject()) {
      throw FieldRules.invalid("label");
    }
    allowKeys(body, FIELD_KEYS);
    String label = FieldRules.label(body.get("label"));
    AnswerType type =
        body.has("answerType")
            ? FieldRules.answerType(body.get("answerType"))
            : AnswerType.SHORT_TEXT;
    boolean required = body.has("required") && FieldRules.bool(body.get("required"), "required");
    String description = FieldRules.description(body.get("description"));
    ObjectNode config = FieldRules.config(type, body.get("config"), null);
    JsonNode showWhen = FieldRules.showWhen(body.get("showWhen"), "showWhen");
    boolean hidden = body.has("hidden") && FieldRules.bool(body.get("hidden"), "hidden");
    List<FieldDefinition> current = definitions(spaceId, eventId, formId);
    if (current.size() >= FieldRules.FIELDS_MAX) {
      throw FieldRules.invalid("fields");
    }
    FieldDefinition next =
        new FieldDefinition(
            UUID.randomUUID(),
            FieldDefinition.CUSTOM,
            null,
            label,
            forms.nextPosition(spaceId, eventId, formId),
            type,
            required,
            description,
            config,
            showWhen,
            hidden);
    List<FieldDefinition> all = new ArrayList<>(current);
    all.add(next);
    FieldRules.checkConditions(all);
    if (forms.saveField(
            next.fieldId(),
            spaceId,
            eventId,
            formId,
            FieldDefinition.CUSTOM,
            null,
            label,
            next.position(),
            values(next))
        != 1) {
      throw new IllegalStateException("custom field was not stored");
    }
    return detail(spaceId, eventId, formId);
  }

  /**
   * Partial update. A SYSTEM field takes {@code label} only. Once the form has a submitted
   * application, a type change, an option removal, and any condition change are {@code
   * FIELD_LOCKED} (DEC-068).
   */
  @Transactional
  public FormDetail patchField(
      UUID actorId, UUID eventId, UUID formId, UUID fieldId, JsonNode body) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    UUID spaceId = opened.location().spaceId();
    if (forms.find(spaceId, eventId, formId).isEmpty()
        || forms.findField(spaceId, eventId, formId, fieldId).isEmpty()) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    requireFormWrite(opened, actorId);
    if (body == null || !body.isObject() || body.isEmpty()) {
      throw FieldRules.invalid("label");
    }
    List<FieldDefinition> current = definitions(spaceId, eventId, formId);
    FieldDefinition before = find(current, fieldId);
    allowKeys(body, before.isSystem() ? Set.of("label") : FIELD_KEYS);
    String label = body.has("label") ? FieldRules.label(body.get("label")) : before.label();
    if (before.isSystem()) {
      if (forms.update(spaceId, eventId, formId, fieldId, label, values(before)) != 1) {
        throw new IllegalStateException("field label was not stored");
      }
      return detail(spaceId, eventId, formId);
    }
    boolean locked = forms.countSubmitted(spaceId, eventId, formId) > 0;
    AnswerType type =
        body.has("answerType")
            ? FieldRules.answerType(body.get("answerType"))
            : before.answerType();
    if (locked && type != before.answerType()) {
      throw new SceneException(ErrorCode.FIELD_LOCKED);
    }
    ObjectNode config = before.config();
    if (body.has("config") || type != before.answerType()) {
      config = FieldRules.config(type, body.get("config"), before);
      if (locked
          && (FieldRules.removesOption(before, config)
              || FieldRules.changesOptionCondition(before, config))) {
        throw new SceneException(ErrorCode.FIELD_LOCKED);
      }
    }
    JsonNode showWhen =
        body.has("showWhen")
            ? FieldRules.showWhen(body.get("showWhen"), "showWhen")
            : before.showWhen();
    if (locked && !Objects.equals(showWhen, before.showWhen())) {
      throw new SceneException(ErrorCode.FIELD_LOCKED);
    }
    FieldDefinition next =
        new FieldDefinition(
            fieldId,
            before.kind(),
            null,
            label,
            before.position(),
            type,
            body.has("required")
                ? FieldRules.bool(body.get("required"), "required")
                : before.required(),
            body.has("description")
                ? FieldRules.description(body.get("description"))
                : before.description(),
            config,
            showWhen,
            body.has("hidden") ? FieldRules.bool(body.get("hidden"), "hidden") : before.hidden());
    List<FieldDefinition> all = new ArrayList<>();
    for (FieldDefinition field : current) {
      all.add(field.fieldId().equals(fieldId) ? next : field);
    }
    FieldRules.checkConditions(all);
    if (forms.update(spaceId, eventId, formId, fieldId, label, values(next)) != 1) {
      throw new IllegalStateException("field was not stored");
    }
    return detail(spaceId, eventId, formId);
  }

  /** The body lists every field id once, in the new order. Conditions must still point earlier. */
  @Transactional
  public FormDetail reorderFields(UUID actorId, UUID eventId, UUID formId, JsonNode body) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    UUID spaceId = opened.location().spaceId();
    if (forms.find(spaceId, eventId, formId).isEmpty()) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    requireFormWrite(opened, actorId);
    if (body == null || !body.isObject()) {
      throw FieldRules.invalid("fieldIds");
    }
    allowKeys(body, Set.of("fieldIds"));
    JsonNode ids = body.get("fieldIds");
    List<FieldDefinition> current = definitions(spaceId, eventId, formId);
    if (ids == null || !ids.isArray() || ids.size() != current.size()) {
      throw FieldRules.invalid("fieldIds");
    }
    Map<UUID, FieldDefinition> byId = new HashMap<>();
    for (FieldDefinition field : current) {
      byId.put(field.fieldId(), field);
    }
    List<FieldDefinition> ordered = new ArrayList<>();
    for (JsonNode id : ids) {
      UUID parsed = id.isString() ? FieldRules.uuid(id.asString()) : null;
      FieldDefinition field = parsed == null ? null : byId.remove(parsed);
      if (field == null) {
        throw FieldRules.invalid("fieldIds");
      }
      ordered.add(field.withPosition(ordered.size()));
    }
    FieldRules.checkConditions(ordered);
    for (FieldDefinition field : ordered) {
      if (forms.updatePosition(spaceId, eventId, formId, field.fieldId(), field.position()) != 1) {
        throw new IllegalStateException("field position was not stored");
      }
    }
    return detail(spaceId, eventId, formId);
  }

  /**
   * SYSTEM fields stay. After a submitted application the operator hides a question instead ({@code
   * FIELD_LOCKED}). A question another condition points at is a {@code CONFLICT}.
   */
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
    if (FieldDefinition.SYSTEM.equals(field.kind())) {
      throw new SceneException(ErrorCode.CONFLICT);
    }
    if (forms.countSubmitted(spaceId, eventId, formId) > 0) {
      throw new SceneException(ErrorCode.FIELD_LOCKED);
    }
    if (FieldRules.isConditionTarget(definitions(spaceId, eventId, formId), fieldId)) {
      throw new SceneException(ErrorCode.CONFLICT);
    }
    if (forms.deleteCustom(spaceId, eventId, formId, fieldId) != 1) {
      throw new IllegalStateException("custom field was not removed");
    }
  }

  private void saveSystem(
      UUID spaceId, UUID eventId, UUID formId, String systemKey, String label, int position) {
    FieldValues values =
        new FieldValues(
            AnswerType.SHORT_TEXT.name(),
            true,
            null,
            json.writeValueAsString(FieldRules.systemConfig(systemKey)),
            null,
            false);
    if (forms.saveField(
            UUID.randomUUID(),
            spaceId,
            eventId,
            formId,
            FieldDefinition.SYSTEM,
            systemKey,
            label,
            position,
            values)
        != 1) {
      throw new IllegalStateException("system field was not stored");
    }
  }

  private void saveCustom(UUID spaceId, UUID eventId, UUID formId, String label, int position) {
    FieldValues values =
        new FieldValues(
            AnswerType.SHORT_TEXT.name(),
            false,
            null,
            json.writeValueAsString(FieldRules.config(AnswerType.SHORT_TEXT, null, null)),
            null,
            false);
    if (forms.saveField(
            UUID.randomUUID(),
            spaceId,
            eventId,
            formId,
            FieldDefinition.CUSTOM,
            null,
            label,
            position,
            values)
        != 1) {
      throw new IllegalStateException("custom field was not stored");
    }
  }

  private List<FieldDefinition> definitions(UUID spaceId, UUID eventId, UUID formId) {
    List<FieldDefinition> fields = new ArrayList<>();
    for (FormFieldRow row : forms.findFields(spaceId, eventId, formId)) {
      fields.add(FieldDefinition.from(row, json));
    }
    return fields;
  }

  private FieldValues values(FieldDefinition field) {
    return new FieldValues(
        field.answerType().name(),
        field.required(),
        field.description(),
        json.writeValueAsString(field.config()),
        field.showWhen() == null ? null : json.writeValueAsString(field.showWhen()),
        field.hidden());
  }

  private static FieldDefinition find(List<FieldDefinition> fields, UUID fieldId) {
    for (FieldDefinition field : fields) {
      if (field.fieldId().equals(fieldId)) {
        return field;
      }
    }
    throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
  }

  private static void allowKeys(JsonNode body, Set<String> keys) {
    for (String key : body.propertyNames()) {
      if (!keys.contains(key)) {
        throw FieldRules.invalid(key);
      }
    }
  }

  private FormDetail detail(UUID spaceId, UUID eventId, UUID formId) {
    FormRow form =
        forms
            .find(spaceId, eventId, formId)
            .orElseThrow(() -> new IllegalStateException("form disappeared after it was written"));
    List<FormFieldView> fields = new ArrayList<>();
    for (FieldDefinition field : definitions(spaceId, eventId, formId)) {
      fields.add(field.view());
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

  private static SceneException field(String name) {
    return new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", name));
  }

  private static RuntimeException constraint(DataIntegrityViolationException exception) {
    String message = exception.getMostSpecificCause().getMessage();
    if (message != null && message.contains("forms_one_per_event")) {
      return new SceneException(ErrorCode.CONFLICT);
    }
    return exception;
  }
}
