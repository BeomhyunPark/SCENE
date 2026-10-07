package app.scene.common.tenant;

import java.util.UUID;

/** One event loaded with {@code space_id} and this operator's access facts. */
public record EventAccessRow(
    UUID eventId,
    String eventName,
    boolean eventOperator,
    boolean accessRevoked,
    String eventRole,
    boolean ownerAuthorityEnded,
    String storedEffect) {}
