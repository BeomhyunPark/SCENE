package app.scene.event.notice;

import app.scene.event.notice.mapper.NoticeMapper;
import app.scene.event.notice.mapper.NoticeQueryMapper;
import java.time.Clock;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * The operator-scope notice refresh value ({@code notice_boards.version}, participant-home-contract
 * §7.5 {@code updates.notices}). It rises by 1 on every notice write of the event, whatever the
 * audience or status: create, patch with a real change, draft delete, publish, archive, unarchive.
 * {@code ALREADY_…} and a same-value patch leave it. It is not the participant value ({@code
 * participant_feed_versions.notices}, which rises only for changes participants can see).
 *
 * <p>The operator {@code GET …/events/{eventId}/updates} route reads it with {@link #read}: one
 * primary-key statement, 0 when the event never had a notice write. Values live only in the
 * database.
 */
@Component
public class NoticeBoardVersions {

  private final NoticeMapper notices;
  private final NoticeQueryMapper queries;
  private final Clock clock;

  public NoticeBoardVersions(NoticeMapper notices, NoticeQueryMapper queries, Clock clock) {
    this.notices = notices;
    this.queries = queries;
    this.clock = clock;
  }

  /** The event's operator notice value; 0 without a row. One statement. */
  public long read(UUID spaceId, UUID eventId) {
    Long found = queries.findBoardVersion(spaceId, eventId);
    return found == null ? 0 : found;
  }

  /** Adds 1 in the caller's transaction (a notice write). */
  @Transactional(propagation = Propagation.MANDATORY)
  public void bump(UUID spaceId, UUID eventId) {
    notices.bumpBoard(spaceId, eventId, clock.instant());
  }
}
