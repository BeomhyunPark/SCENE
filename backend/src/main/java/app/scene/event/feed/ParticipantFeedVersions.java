package app.scene.event.feed;

import app.scene.event.feed.mapper.ParticipantFeedVersionMapper;
import java.time.Clock;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * The one place that raises the participant refresh values (DEC-080 §4, {@code
 * participant_feed_versions}). A publish path calls {@link #bump} inside its own transaction, after
 * the change is written:
 *
 * <pre>{@code
 * @Transactional
 * public PublishResult publish(...) {
 *   ... write the publication ...
 *   feedVersions.bump(spaceId, eventId, FeedArea.SCHEDULE);
 * }
 * }</pre>
 *
 * <p>The bump is one {@code INSERT … ON CONFLICT … DO UPDATE SET col = col + 1} statement. It joins
 * the caller's transaction ({@code MANDATORY}: calling it without one throws), so a rolled back
 * publish never raises the value and a committed one always does. Bump only for a real change that
 * participants can see (for example {@code PUBLISHED}, not {@code ALREADY_PUBLISHED}, never a
 * working-copy save). Values live only in the database.
 */
@Component
public class ParticipantFeedVersions {

  private final ParticipantFeedVersionMapper versions;
  private final Clock clock;

  public ParticipantFeedVersions(ParticipantFeedVersionMapper versions, Clock clock) {
    this.versions = versions;
    this.clock = clock;
  }

  /** Adds 1 to {@code area} of the event in the caller's transaction. */
  @Transactional(propagation = Propagation.MANDATORY)
  public void bump(UUID spaceId, UUID eventId, FeedArea area) {
    versions.bump(spaceId, eventId, area.column(), clock.instant());
  }

  /** The event's values; all 0 when no row exists yet. One primary-key read. */
  public FeedVersions read(UUID spaceId, UUID eventId) {
    FeedVersions found = versions.find(spaceId, eventId);
    return found == null ? FeedVersions.ZERO : found;
  }
}
