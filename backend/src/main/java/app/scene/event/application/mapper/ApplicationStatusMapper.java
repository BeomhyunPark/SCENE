package app.scene.event.application.mapper;

import app.scene.event.application.WithdrawnRow;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** Withdraw and restore of applications and their history (DEC-084). */
@Mapper
public interface ApplicationStatusMapper {

  int setStatus(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("applicationId") UUID applicationId,
      @Param("from") String from,
      @Param("to") String to);

  int insertLog(
      @Param("id") UUID id,
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("participantId") UUID participantId,
      @Param("applicationId") UUID applicationId,
      @Param("action") String action,
      @Param("reason") String reason,
      @Param("blockReapply") boolean blockReapply,
      @Param("actorKind") String actorKind,
      @Param("actorUserId") UUID actorUserId,
      @Param("createdAt") Instant createdAt);

  List<WithdrawnRow> listWithdrawn(@Param("spaceId") UUID spaceId, @Param("eventId") UUID eventId);

  WithdrawnRow findWithdrawn(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("applicationId") UUID applicationId);
}
