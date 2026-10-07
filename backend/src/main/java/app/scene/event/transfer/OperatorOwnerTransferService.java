package app.scene.event.transfer;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.event.lifecycle.EventAccessGate;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

/**
 * Event owner transfer HTTP on {@link OwnerTransferService}. This class resolves the event and
 * shapes the body. It does not insert or change a transfer on its own. Create is 201 and does not
 * send {@code Location}. {@code requestedAt} is omitted: {@code owner_transfers} has no such
 * column. Space owner transfer stays closed.
 */
@Service
public class OperatorOwnerTransferService {

  static final String SCOPE = "EVENT";
  static final String REQUESTED = "REQUESTED";
  static final String DECLINED = "DECLINED";
  static final String CANCELLED = "CANCELLED";

  private static final String PENDING_INDEX = "owner_transfers_one_pending";

  private final EventAccessGate gate;
  private final OwnerTransferService transfers;
  private final OwnerTransferRepository rows;

  public OperatorOwnerTransferService(
      EventAccessGate gate, OwnerTransferService transfers, OwnerTransferRepository rows) {
    this.gate = gate;
    this.transfers = transfers;
    this.rows = rows;
  }

  public Map<String, Object> request(UUID actorId, UUID eventId, JsonNode body) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (!gate.actor(actorId, opened).eventOwner()) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    UUID toUserId = toUserId(body);
    UUID spaceId = opened.location().spaceId();
    UUID transferId;
    try {
      transferId = transfers.request(spaceId, eventId, actorId, toUserId);
    } catch (DataIntegrityViolationException exception) {
      if (pendingUnique(exception)) {
        throw new SceneException(ErrorCode.TRANSFER_NOT_PENDING);
      }
      throw exception;
    }
    return body(view(spaceId, transferId), REQUESTED);
  }

  public Map<String, Object> read(UUID actorId, UUID transferId) {
    TransferRow row = required(transferId);
    if (!canRead(actorId, row)) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    return body(view(row.spaceId(), transferId), null);
  }

  public Map<String, Object> accept(UUID actorId, UUID transferId) {
    TransferRow row = required(transferId);
    TransferAcceptResult result = transfers.accept(row.spaceId(), transferId, actorId);
    return body(view(row.spaceId(), transferId), result.outcome());
  }

  public Map<String, Object> decline(UUID actorId, UUID transferId) {
    TransferRow row = required(transferId);
    transfers.decline(row.spaceId(), transferId, actorId);
    return body(view(row.spaceId(), transferId), DECLINED);
  }

  public Map<String, Object> cancel(UUID actorId, UUID transferId) {
    TransferRow row = required(transferId);
    transfers.cancel(row.spaceId(), transferId, actorId);
    return body(view(row.spaceId(), transferId), CANCELLED);
  }

  private boolean canRead(UUID actorId, TransferRow row) {
    if (actorId.equals(row.fromUserId()) || actorId.equals(row.toUserId())) {
      return true;
    }
    try {
      EventAccessGate.Opened opened = gate.open(actorId, row.eventId());
      return gate.actor(actorId, opened).eventOwner();
    } catch (SceneException exception) {
      return false;
    }
  }

  private TransferRow required(UUID transferId) {
    return rows.findEvent(transferId)
        .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
  }

  private TransferView view(UUID spaceId, UUID transferId) {
    return rows.findView(spaceId, transferId)
        .orElseThrow(() -> new IllegalStateException("transfer disappeared after it was written"));
  }

  private static Map<String, Object> body(TransferView view, String outcome) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("transferId", view.transferId());
    body.put("scope", SCOPE);
    body.put("spaceId", view.spaceId());
    body.put("spaceName", view.spaceName());
    body.put("eventId", view.eventId());
    body.put("eventName", view.eventName());
    body.put("from", party(view.fromUserId(), view.fromDisplayName()));
    body.put("to", party(view.toUserId(), view.toDisplayName()));
    body.put("status", view.status());
    if (view.acceptedAt() != null) {
      body.put("acceptedAt", view.acceptedAt());
    }
    if (view.handoverEndsAt() != null) {
      body.put("handoverEndsAt", view.handoverEndsAt());
    }
    if (outcome != null) {
      body.put("outcome", outcome);
    }
    return body;
  }

  private static Map<String, Object> party(UUID userId, String displayName) {
    Map<String, Object> party = new LinkedHashMap<>();
    party.put("userId", userId);
    party.put("displayName", displayName);
    return party;
  }

  private static UUID toUserId(JsonNode body) {
    if (body == null
        || !body.isObject()
        || !body.has("toUserId")
        || body.get("toUserId").isNull()) {
      throw field();
    }
    JsonNode node = body.get("toUserId");
    if (!node.isString()) {
      throw field();
    }
    try {
      return UUID.fromString(node.asString());
    } catch (IllegalArgumentException exception) {
      throw field();
    }
  }

  private static SceneException field() {
    return new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "toUserId"));
  }

  private static boolean pendingUnique(DataIntegrityViolationException exception) {
    Throwable current = exception;
    while (current != null) {
      String message = current.getMessage();
      if (message != null && message.contains(PENDING_INDEX)) {
        return true;
      }
      current = current.getCause();
    }
    return false;
  }
}
