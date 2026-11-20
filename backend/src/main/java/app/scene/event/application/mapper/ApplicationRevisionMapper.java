package app.scene.event.application.mapper;

import app.scene.event.application.ApplicationRevisionRow;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** Revisions of one participant's application (DEC-078 §4). */
@Mapper
public interface ApplicationRevisionMapper {

  /** Locks the participant row so two edits of the same person run one after the other. */
  UUID lockParticipant(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("participantId") UUID participantId);

  ApplicationRevisionRow findCurrent(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("participantId") UUID participantId);

  ApplicationRevisionRow find(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("applicationId") UUID applicationId);

  UUID findParticipantOf(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("applicationId") UUID applicationId);

  List<ApplicationRevisionRow> listByParticipant(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("participantId") UUID participantId);

  int supersede(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("applicationId") UUID applicationId,
      @Param("fromStatus") String fromStatus);

  /** The participant's latest revision, whatever its status. */
  ApplicationRevisionRow findLatest(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("participantId") UUID participantId);

  int insertRevision(
      @Param("id") UUID id,
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("formId") UUID formId,
      @Param("participantId") UUID participantId,
      @Param("revision") int revision,
      @Param("previousId") UUID previousId,
      @Param("revisedBy") String revisedBy,
      @Param("revisedByUserId") UUID revisedByUserId,
      @Param("changes") String changes,
      @Param("submittedAt") Instant submittedAt);

  int moveOperation(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("fromId") UUID fromId,
      @Param("toId") UUID toId);
}
