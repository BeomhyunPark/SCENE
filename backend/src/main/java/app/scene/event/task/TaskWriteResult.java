package app.scene.event.task;

/** Outcome plus the checklist counts the server calculates. */
public record TaskWriteResult(String outcome, String status, int version, int done, int total) {}
