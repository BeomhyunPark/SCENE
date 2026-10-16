package app.scene.event;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.permission.Permission;
import app.scene.common.permission.PermissionEvaluator;
import app.scene.common.tenant.OperatorAccess;
import app.scene.common.tenant.SpaceMembership;
import app.scene.common.web.ItemPage;
import app.scene.common.web.PageRequest;
import app.scene.common.web.Sorts;
import app.scene.event.lifecycle.EventAccessGate;
import app.scene.event.lifecycle.EventListRow;
import app.scene.event.lifecycle.EventProfile;
import app.scene.event.lifecycle.EventRepository;
import app.scene.space.EventUserPermissionRepository;
import app.scene.space.EventUserRepository;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

/**
 * Create, list, and name patch on the existing {@code events} row. The architecture lists {@code
 * EVENT_CREATE} as a candidate and does not say who may create. Any active member of the space may
 * open an event. The creator is stored as {@code event_users} OWNER in the same transaction. {@code
 * EVENT_CREATE} is not a permission key. {@code Idempotency-Key} is not read. {@code
 * lifecycleStatus} is not writable here. A space owner or admin may read every event in the space
 * and is not given an {@code event_users} row. A name change needs effective {@code EVENT_UPDATE}.
 */
@Service
public class OperatorEventCommandService {

  private static final int NAME_MAX = 200;
  private static final int PLACE_MAX = 200;
  private static final Set<String> CREATE_KEYS =
      Set.of("name", "startDate", "endDate", "place", "eventType");

  private final OperatorAccess access;
  private final EventAccessGate gate;
  private final EventRepository events;
  private final EventUserRepository eventUsers;
  private final EventUserPermissionRepository permissions;

  public OperatorEventCommandService(
      OperatorAccess access,
      EventAccessGate gate,
      EventRepository events,
      EventUserRepository eventUsers,
      EventUserPermissionRepository permissions) {
    this.access = access;
    this.gate = gate;
    this.events = events;
    this.eventUsers = eventUsers;
    this.permissions = permissions;
  }

  @Transactional
  public EventDetail create(UUID actorId, UUID spaceId, JsonNode body) {
    requireActiveMember(actorId, spaceId);
    ParsedCreate parsed = parseCreate(body);
    UUID eventId = UUID.randomUUID();
    if (events.save(
            eventId,
            spaceId,
            parsed.name(),
            parsed.startDate(),
            parsed.endDate(),
            parsed.place(),
            parsed.eventType() == null ? null : parsed.eventType().name())
        != 1) {
      throw new IllegalStateException("event was not stored");
    }
    if (eventUsers.saveOwner(spaceId, eventId, actorId) != 1) {
      throw new IllegalStateException("event owner was not stored");
    }
    return storedDetail(eventId, "event disappeared after it was stored");
  }

  public ItemPage<EventListItem> list(
      UUID actorId, UUID spaceId, Integer page, Integer size, List<String> sort) {
    SpaceMembership membership = requireActiveMember(actorId, spaceId);
    PageRequest request = PageRequest.of(page, size);
    Sorts.parse(sort, Set.of());
    UUID operatedBy = seesEveryEvent(membership) ? null : actorId;
    long total = events.countInSpace(spaceId, operatedBy);
    List<EventListItem> items = new ArrayList<>();
    for (EventListRow row : events.listInSpace(spaceId, operatedBy, request)) {
      items.add(
          new EventListItem(
              row.eventId(),
              row.name(),
              row.lifecycleStatus(),
              row.startDate(),
              row.endDate(),
              row.place(),
              eventType(row.eventType())));
    }
    return ItemPage.of(items, request, total);
  }

  public EventDetail read(UUID actorId, UUID eventId) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (!mayRead(opened, actorId)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    return storedDetail(eventId, "event disappeared after it was opened");
  }

  @Transactional
  public EventDetail rename(UUID actorId, UUID eventId, JsonNode body) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    requireEventUpdate(opened, actorId);
    String name = parseName(body);
    UUID spaceId = opened.location().spaceId();
    if (events.updateName(spaceId, eventId, name) != 1) {
      throw new IllegalStateException("event name was not stored");
    }
    EventProfile stored =
        events
            .findProfile(eventId)
            .orElseThrow(() -> new IllegalStateException("event disappeared after it was renamed"));
    if (!stored.lifecycleStatus().equals(opened.location().lifecycleStatus())
        || stored.lifecycleVersion() != opened.location().lifecycleVersion()) {
      throw new IllegalStateException("rename changed the lifecycle");
    }
    return detail(stored);
  }

  private SpaceMembership requireActiveMember(UUID actorId, UUID spaceId) {
    SpaceMembership membership = access.spaceMembership(actorId, spaceId);
    if (membership.kind() == SpaceMembership.Kind.ABSENT) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    if (membership.kind() != SpaceMembership.Kind.ACTIVE) {
      throw new SceneException(ErrorCode.NOT_A_MEMBER);
    }
    return membership;
  }

  /** Space owner and space admin read, matching the existing org-admin event read. */
  private static boolean seesEveryEvent(SpaceMembership membership) {
    return "OWNER".equals(membership.role()) || "ADMIN".equals(membership.role());
  }

  /**
   * Effective {@code EVENT_READ}, or an active space owner or admin. This does not insert an
   * operator row and does not widen lifecycle reads.
   */
  private boolean mayRead(EventAccessGate.Opened opened, UUID actorId) {
    if (allows(opened, actorId, Permission.EVENT_READ)) {
      return true;
    }
    return seesEveryEvent(opened.membership());
  }

  private void requireEventUpdate(EventAccessGate.Opened opened, UUID actorId) {
    if (!allows(opened, actorId, Permission.EVENT_UPDATE)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
  }

  private boolean allows(EventAccessGate.Opened opened, UUID actorId, Permission permission) {
    if (opened.eventRole() == null) {
      return false;
    }
    UUID spaceId = opened.location().spaceId();
    UUID eventId = opened.location().id();
    String effect =
        permissions.findEffect(spaceId, eventId, actorId, permission.name()).orElse(null);
    return PermissionEvaluator.allows(
        permission, opened.eventRole(), opened.authorityEnded(), effect);
  }

  private EventDetail storedDetail(UUID eventId, String missing) {
    return detail(
        events.findProfile(eventId).orElseThrow(() -> new IllegalStateException(missing)));
  }

  private static EventDetail detail(EventProfile profile) {
    return new EventDetail(
        profile.eventId(),
        profile.name(),
        profile.lifecycleStatus(),
        profile.lifecycleVersion(),
        profile.startDate(),
        profile.endDate(),
        profile.place(),
        eventType(profile.eventType()));
  }

  private static EventType eventType(String raw) {
    if (raw == null) {
      return null;
    }
    return EventType.valueOf(raw);
  }

  /**
   * Create body. {@code name} is required. Period, place, and type may be omitted. Any other field,
   * including {@code lifecycleStatus}, is rejected. The stored type does not change later checks.
   */
  private static ParsedCreate parseCreate(JsonNode body) {
    if (body == null || !body.isObject()) {
      throw field("name");
    }
    for (String key : body.propertyNames()) {
      if (!CREATE_KEYS.contains(key)) {
        throw field(key);
      }
    }
    LocalDate startDate = parseDate(body.get("startDate"), "startDate");
    LocalDate endDate = parseDate(body.get("endDate"), "endDate");
    if (startDate != null && endDate != null && endDate.isBefore(startDate)) {
      throw field("endDate");
    }
    return new ParsedCreate(
        parseRequiredName(body.get("name")),
        parsePlace(body.get("place")),
        startDate,
        endDate,
        parseEventType(body.get("eventType")));
  }

  private static LocalDate parseDate(JsonNode node, String name) {
    if (node == null || node.isNull()) {
      return null;
    }
    if (!node.isString()) {
      throw field(name);
    }
    try {
      return LocalDate.parse(node.asString());
    } catch (DateTimeParseException exception) {
      throw field(name);
    }
  }

  private static String parsePlace(JsonNode node) {
    if (node == null || node.isNull()) {
      return null;
    }
    if (!node.isString()) {
      throw field("place");
    }
    String place = node.asString().strip();
    if (place.isEmpty()) {
      return null;
    }
    if (place.length() > PLACE_MAX) {
      throw field("place");
    }
    return place;
  }

  private static EventType parseEventType(JsonNode node) {
    if (node == null || node.isNull()) {
      return null;
    }
    if (!node.isString()) {
      throw field("eventType");
    }
    String raw = node.asString();
    for (EventType type : EventType.values()) {
      if (type.name().equals(raw)) {
        return type;
      }
    }
    throw field("eventType");
  }

  private record ParsedCreate(
      String name, String place, LocalDate startDate, LocalDate endDate, EventType eventType) {}

  /**
   * The body is {@code name} only. Any other field, including {@code lifecycleStatus}, is rejected.
   */
  private static String parseName(JsonNode body) {
    if (body == null || !body.isObject()) {
      throw field("name");
    }
    for (String key : body.propertyNames()) {
      if (!"name".equals(key)) {
        throw field(key);
      }
    }
    return parseRequiredName(body.get("name"));
  }

  private static String parseRequiredName(JsonNode nameNode) {
    if (nameNode == null || nameNode.isNull() || !nameNode.isString()) {
      throw field("name");
    }
    String name = nameNode.asString().strip();
    if (name.isEmpty() || name.length() > NAME_MAX) {
      throw field("name");
    }
    return name;
  }

  private static SceneException field(String name) {
    return new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", name));
  }
}
