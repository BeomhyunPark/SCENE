package app.scene.event.notice.mapper;

import java.time.Instant;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface NoticeMapper {

  int insert(
      @Param("id") UUID id,
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("title") String title,
      @Param("body") String body,
      @Param("important") boolean important,
      @Param("pinned") boolean pinned,
      @Param("audience") String audience,
      @Param("status") String status,
      @Param("publishedAt") Instant publishedAt,
      @Param("actorId") UUID actorId,
      @Param("at") Instant at);

  /** Writes every field; {@code version} goes up by 1. */
  int update(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("id") UUID id,
      @Param("title") String title,
      @Param("body") String body,
      @Param("important") boolean important,
      @Param("pinned") boolean pinned,
      @Param("audience") String audience,
      @Param("status") String status,
      @Param("firstPublishedAt") Instant firstPublishedAt,
      @Param("publishedAt") Instant publishedAt,
      @Param("editedAt") Instant editedAt,
      @Param("archivedAt") Instant archivedAt,
      @Param("actorId") UUID actorId,
      @Param("at") Instant at);

  int delete(@Param("spaceId") UUID spaceId, @Param("eventId") UUID eventId, @Param("id") UUID id);

  int bumpBoard(
      @Param("spaceId") UUID spaceId, @Param("eventId") UUID eventId, @Param("at") Instant at);
}
