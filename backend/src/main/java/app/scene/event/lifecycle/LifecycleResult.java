package app.scene.event.lifecycle;

public record LifecycleResult(
    String outcome, String lifecycleStatus, int lifecycleVersion, String actedAs) {}
