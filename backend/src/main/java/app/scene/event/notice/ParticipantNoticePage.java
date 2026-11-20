package app.scene.event.notice;

import java.util.List;

/** Participant list page. {@code nextBefore} is the next request's {@code before}, or null. */
public record ParticipantNoticePage(List<ParticipantNoticeItem> items, String nextBefore) {}
