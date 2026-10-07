package app.scene.space;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.tenant.OperatorAccess;
import app.scene.common.tenant.SpaceMembership;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

/**
 * Leave HTTP on {@link MembershipLeaveService}. This class checks the space path, then calls that
 * service. It does not decide the block order or write the keep and revoke. A clear preview is not
 * a guarantee on the later leave.
 *
 * <p>The confirmed section names no preview body and no success body. {@code blockReason} is the
 * one code from {@link MembershipLeaveService#leavePreview}. A successful leave is an empty 200.
 */
@Service
public class OperatorLeaveService {

  private final OperatorAccess access;
  private final MembershipLeaveService membership;
  private final EventUserRepository eventUsers;

  public OperatorLeaveService(
      OperatorAccess access, MembershipLeaveService membership, EventUserRepository eventUsers) {
    this.access = access;
    this.membership = membership;
    this.eventUsers = eventUsers;
  }

  public Map<String, Object> preview(UUID userId, UUID spaceId) {
    requireMember(userId, spaceId);
    ErrorCode block = membership.leavePreview(spaceId, userId);
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("leaveBlocked", block != null);
    body.put("blockReason", block == null ? null : block.name());
    List<Map<String, Object>> events = new ArrayList<>();
    for (OperatedEvent event : eventUsers.findOperated(spaceId, userId)) {
      Map<String, Object> item = new LinkedHashMap<>();
      item.put("eventId", event.eventId());
      item.put("isOwner", event.owner());
      item.put("handoverAccepted", event.handoverAccepted());
      item.put("openTasks", event.openTasks());
      events.add(item);
    }
    body.put("events", events);
    return body;
  }

  public void leave(UUID userId, UUID spaceId, JsonNode body) {
    requireMember(userId, spaceId);
    membership.leave(spaceId, userId, keepEventIds(spaceId, userId, body));
  }

  /**
   * Missing {@code keepEventIds} is null, so the service can block before it reports the field. A
   * value that is not a list of ids is not a list the service can judge, so the same preview block
   * is applied first.
   */
  private List<UUID> keepEventIds(UUID spaceId, UUID userId, JsonNode body) {
    if (body == null || body.isNull() || !body.isObject()) {
      return null;
    }
    JsonNode node = body.get("keepEventIds");
    if (node == null || node.isNull()) {
      return null;
    }
    if (!node.isArray()) {
      throw blockedOrInvalid(spaceId, userId);
    }
    List<UUID> ids = new ArrayList<>();
    for (JsonNode item : node) {
      ids.add(eventId(spaceId, userId, item));
    }
    return ids;
  }

  private UUID eventId(UUID spaceId, UUID userId, JsonNode item) {
    if (item == null || !item.isString()) {
      throw blockedOrInvalid(spaceId, userId);
    }
    try {
      return UUID.fromString(item.asString());
    } catch (IllegalArgumentException exception) {
      throw blockedOrInvalid(spaceId, userId);
    }
  }

  private SceneException blockedOrInvalid(UUID spaceId, UUID userId) {
    ErrorCode block = membership.leavePreview(spaceId, userId);
    if (block != null) {
      return new SceneException(block);
    }
    return new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "keepEventIds"));
  }

  private void requireMember(UUID userId, UUID spaceId) {
    SpaceMembership space = access.spaceMembership(userId, spaceId);
    if (space.kind() == SpaceMembership.Kind.ABSENT) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    if (space.kind() != SpaceMembership.Kind.ACTIVE) {
      throw new SceneException(ErrorCode.NOT_A_MEMBER);
    }
  }
}
