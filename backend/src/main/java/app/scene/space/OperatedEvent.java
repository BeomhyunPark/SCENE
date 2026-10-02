package app.scene.space;

import java.util.UUID;

public record OperatedEvent(
    UUID eventId, boolean owner, int otherOwners, boolean handoverAccepted, int openTasks) {}
