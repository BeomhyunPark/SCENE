package app.scene.event.notice;

import java.util.List;

/**
 * Operator list (notice-contract §4). {@code pinnedCount} is the event's pinned {@code PUBLISHED}
 * notices whatever the filters.
 */
public record NoticeList(List<Notice> items, int pinnedCount, String nextBefore) {}
