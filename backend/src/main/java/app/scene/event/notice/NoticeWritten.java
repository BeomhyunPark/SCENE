package app.scene.event.notice;

/** Create and patch response: the notice and how many notifications were made. */
public record NoticeWritten(Notice notice, int notifiedCount) {}
