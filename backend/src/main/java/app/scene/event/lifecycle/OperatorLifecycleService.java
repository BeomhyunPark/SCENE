package app.scene.event.lifecycle;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.web.ItemPage;
import app.scene.common.web.PageRequest;
import app.scene.common.web.SortOrder;
import app.scene.common.web.Sorts;
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
 * Lifecycle HTTP on {@link EventLifecycleService}. This class resolves the event and the caller. It
 * does not transition, revoke invitations, or write audit on its own. {@code PATCH
 * /events/{eventId}} is not created here, so {@code lifecycleStatus} stays off that route.
 */
@Service
public class OperatorLifecycleService {

  private static final Set<String> TRANSITION_SORTS = Set.of("occurredAt");

  private final EventAccessGate gate;
  private final EventRepository events;
  private final EventLifecycleService lifecycle;
  private final JsonMapper json;

  public OperatorLifecycleService(
      EventAccessGate gate,
      EventRepository events,
      EventLifecycleService lifecycle,
      JsonMapper json) {
    this.gate = gate;
    this.events = events;
    this.lifecycle = lifecycle;
    this.json = json;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> read(UUID actorId, UUID eventId) {
    EventAccessGate.Opened opened = readable(actorId, eventId);
    EventLocation location = opened.location();
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("lifecycleStatus", location.lifecycleStatus());
    body.put("lifecycleVersion", location.lifecycleVersion());
    events
        .findLatestTransition(location.spaceId(), eventId)
        .ifPresent(last -> body.put("lastTransition", lastTransition(last)));
    return body;
  }

  @Transactional(readOnly = true)
  public ItemPage<LifecycleTransitionItem> transitions(
      UUID actorId, UUID eventId, Integer page, Integer size, List<String> sort) {
    EventAccessGate.Opened opened = readable(actorId, eventId);
    PageRequest request = PageRequest.of(page, size);
    String order = orderClause(Sorts.parse(sort, TRANSITION_SORTS));
    EventLocation location = opened.location();
    long total = events.countTransitions(location.spaceId(), eventId);
    List<LifecycleTransitionItem> items =
        events.findTransitions(location.spaceId(), eventId, request, order).stream()
            .map(this::item)
            .toList();
    return ItemPage.of(items, request, total);
  }

  @Transactional
  public LifecycleResult activate(UUID actorId, UUID eventId, JsonNode body) {
    return command(LifecycleCommand.ACTIVATE, actorId, eventId, body);
  }

  @Transactional
  public LifecycleResult end(UUID actorId, UUID eventId, JsonNode body) {
    return command(LifecycleCommand.END, actorId, eventId, body);
  }

  @Transactional
  public LifecycleResult reopen(UUID actorId, UUID eventId, JsonNode body) {
    return command(LifecycleCommand.REOPEN, actorId, eventId, body);
  }

  @Transactional
  public LifecycleResult archive(UUID actorId, UUID eventId, JsonNode body) {
    return command(LifecycleCommand.ARCHIVE, actorId, eventId, body);
  }

  @Transactional
  public LifecycleResult unarchive(UUID actorId, UUID eventId, JsonNode body) {
    return command(LifecycleCommand.UNARCHIVE, actorId, eventId, body);
  }

  private LifecycleResult command(
      LifecycleCommand command, UUID actorId, UUID eventId, JsonNode body) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    UUID spaceId = opened.location().spaceId();
    LifecycleRequest request = parse(body);
    OperatorActor actor = gate.actor(actorId, opened);
    return switch (command) {
      case ACTIVATE -> lifecycle.activate(spaceId, eventId, request, actor);
      case END -> lifecycle.end(spaceId, eventId, request, actor);
      case REOPEN -> lifecycle.reopen(spaceId, eventId, request, actor);
      case ARCHIVE -> lifecycle.archive(spaceId, eventId, request, actor);
      case UNARCHIVE -> lifecycle.unarchive(spaceId, eventId, request, actor);
    };
  }

  private EventAccessGate.Opened readable(UUID actorId, UUID eventId) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (!gate.mayRead(opened)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    return opened;
  }

  private LifecycleTransitionItem item(LifecycleTransitionRow row) {
    return new LifecycleTransitionItem(
        row.command(),
        row.fromStatus(),
        row.toStatus(),
        row.actedAs(),
        row.actorUserId(),
        row.reason(),
        row.occurredAt(),
        warnings(row.warningsSnapshot()));
  }

  private Map<String, Object> warnings(String snapshot) {
    if (snapshot == null || snapshot.isBlank()) {
      return Map.of();
    }
    JsonNode node = json.readTree(snapshot);
    Map<String, Object> warnings = new LinkedHashMap<>();
    for (String name : node.propertyNames()) {
      warnings.put(name, jsonValue(node.get(name)));
    }
    return warnings;
  }

  private static Object jsonValue(JsonNode node) {
    if (node == null || node.isNull()) {
      return null;
    }
    if (node.isIntegralNumber()) {
      return node.intValue();
    }
    if (node.isNumber()) {
      return node.doubleValue();
    }
    if (node.isBoolean()) {
      return node.booleanValue();
    }
    return node.asString();
  }

  private static Map<String, Object> lastTransition(LifecycleTransitionView last) {
    Map<String, Object> transition = new LinkedHashMap<>();
    transition.put("command", last.command());
    transition.put("fromStatus", last.fromStatus());
    transition.put("toStatus", last.toStatus());
    transition.put("actedAs", last.actedAs());
    transition.put("occurredAt", last.occurredAt());
    return transition;
  }

  /**
   * A sort list is one {@code occurredAt} field. Anything else is 400. The default is newest first,
   * with {@code id} as the tie break.
   */
  private static String orderClause(List<SortOrder> orders) {
    if (orders.isEmpty()) {
      return "occurred_at DESC, id DESC";
    }
    if (orders.size() != 1 || !"occurredAt".equals(orders.get(0).field())) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "sort"));
    }
    String direction = orders.get(0).direction().name();
    return "occurred_at " + direction + ", id " + direction;
  }

  private static LifecycleRequest parse(JsonNode body) {
    if (body == null || body.isNull()) {
      return new LifecycleRequest(null, null, null, null, null);
    }
    if (!body.isObject()) {
      return new LifecycleRequest(null, null, null, null, "expectedLifecycleVersion");
    }
    String invalid = null;
    Integer version = null;
    JsonNode versionNode = body.get("expectedLifecycleVersion");
    if (versionNode != null && !versionNode.isNull()) {
      if (versionNode.isIntegralNumber()
          && versionNode.longValue() >= Integer.MIN_VALUE
          && versionNode.longValue() <= Integer.MAX_VALUE) {
        version = versionNode.intValue();
      } else {
        invalid = "expectedLifecycleVersion";
      }
    }
    Boolean acknowledge = null;
    JsonNode acknowledgeNode = body.get("acknowledgeWarnings");
    if (acknowledgeNode != null && !acknowledgeNode.isNull()) {
      if (acknowledgeNode.isBoolean()) {
        acknowledge = acknowledgeNode.booleanValue();
      } else if (invalid == null) {
        invalid = "acknowledgeWarnings";
      }
    }
    String reason = null;
    JsonNode reasonNode = body.get("reason");
    if (reasonNode != null && !reasonNode.isNull()) {
      if (reasonNode.isString()) {
        reason = reasonNode.asString();
      } else if (invalid == null) {
        invalid = "reason";
      }
    }
    String overrideReason = null;
    JsonNode overrideNode = body.get("override");
    if (overrideNode != null && !overrideNode.isNull()) {
      JsonNode overrideReasonNode = overrideNode.isObject() ? overrideNode.get("reason") : null;
      if (!overrideNode.isObject()
          || (overrideReasonNode != null
              && !overrideReasonNode.isNull()
              && !overrideReasonNode.isString())) {
        if (invalid == null) {
          invalid = "override.reason";
        }
      } else if (overrideReasonNode != null && overrideReasonNode.isString()) {
        overrideReason = overrideReasonNode.asString();
      }
    }
    return new LifecycleRequest(version, acknowledge, reason, overrideReason, invalid);
  }
}
