package app.scene.event.notice.mapper;

import app.scene.event.notice.NoticeRow;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface NoticeQueryMapper {

  NoticeRow find(
      @Param("spaceId") UUID spaceId, @Param("eventId") UUID eventId, @Param("id") UUID id);

  /** Operator list: every row of the given statuses, full body. */
  List<NoticeRow> findByStatus(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("statuses") List<String> statuses);

  /** Participant list: {@code PUBLISHED} rows; {@code body} holds only its first characters. */
  List<NoticeRow> findPublishedHeads(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("headLength") int headLength);

  List<UUID> findPinnedIds(@Param("spaceId") UUID spaceId, @Param("eventId") UUID eventId);

  Long findBoardVersion(@Param("spaceId") UUID spaceId, @Param("eventId") UUID eventId);

  /**
   * Operators whose access to the event is alive and who can read notices: an {@code event_users}
   * row (operator removal and space leave delete it), and not an owner whose handover authority
   * ended unless {@code EVENT_READ} was granted back.
   */
  List<UUID> findActiveOperatorIds(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("authorityStatuses") List<String> authorityStatuses);
}
