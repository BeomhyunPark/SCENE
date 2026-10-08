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
import app.scene.event.lifecycle.EventLocation;
import app.scene.event.lifecycle.EventRepository;
import app.scene.space.EventUserPermissionRepository;
import app.scene.space.EventUserRepository;
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
    String name = parseName(body);
    UUID eventId = UUID.randomUUID();
    if (events.save(eventId, spaceId, name) != 1) {
      throw new IllegalStateException("event was not stored");
    }
    if (eventUsers.saveOwner(spaceId, eventId, actorId) != 1) {
      throw new IllegalStateException("event owner was not stored");
    }
    EventLocation stored =
        events
            .findLocation(eventId)
            .orElseThrow(() -> new IllegalStateException("event disappeared after it was stored"));
    return detail(stored);
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
      items.add(new EventListItem(row.eventId(), row.name(), row.lifecycleStatus()));
    }
    return ItemPage.of(items, request, total);
  }

  public EventDetail read(UUID actorId, UUID eventId) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (!mayRead(opened, actorId)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    return detail(opened.location());
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
    EventLocation stored =
        events
            .findLocation(eventId)
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

  private static EventDetail detail(EventLocation location) {
    return new EventDetail(
        location.id(), location.name(), location.lifecycleStatus(), location.lifecycleVersion());
  }

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
    JsonNode nameNode = body.get("name");
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
