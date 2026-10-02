package app.scene.event.lifecycle;

public record LifecycleRequest(
    int expectedLifecycleVersion,
    Boolean acknowledgeWarnings,
    String reason,
    String overrideReason) {}
