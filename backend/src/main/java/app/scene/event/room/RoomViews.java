package app.scene.event.room;

import app.scene.event.group.BoardSlot;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Response bodies of the room paths (api.md "숙소"). */
public final class RoomViews {

  private RoomViews() {}

  /** A room's gender split: the GENDER option id and its current label (null when not found). */
  public record Gender(String optionId, String label) {}

  /**
   * One room of the working copy with its active member count and warnings. The board, create and
   * edit all answer with this shape.
   */
  public record BoardRoom(
      UUID roomId,
      String name,
      String locationNote,
      Integer capacity,
      Gender gender,
      int sortOrder,
      int version,
      long memberCount,
      List<Warning> warnings) {}

  /**
   * A warning (api.md "숙소"). {@code count} and {@code capacity} are set for {@code OVER_CAPACITY},
   * {@code participantIds} for the others; unset keys are left out.
   */
  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record Warning(String code, Long count, Integer capacity, List<UUID> participantIds) {

    public static final String OVER_CAPACITY = "OVER_CAPACITY";
    public static final String GENDER_MISMATCH = "GENDER_MISMATCH";
    public static final String GENDER_UNKNOWN = "GENDER_UNKNOWN";
    public static final String NOT_LODGING = "NOT_LODGING";
  }

  /** {@code GET …/room-board}. */
  public record Board(
      String eventStatus,
      long boardVersion,
      List<BoardRoom> rooms,
      List<BoardPerson> participants,
      List<Withdrawn> withdrawn,
      PublicationSummary publication,
      List<BoardGroup> groups,
      List<BoardSlot> slots) {}

  /**
   * An active participant on the board. {@code group} is from the latest group publication; {@code
   * draftGroupId} is the group working copy's group, only for a reader with {@code GROUP_WRITE}.
   * {@code review} is the "review again" mark of A11 (#461) and is null until that lands.
   */
  public record BoardPerson(
      UUID participantId,
      String name,
      String cohort,
      Gender gender,
      String attendance,
      List<String> slotIds,
      Lodging lodging,
      List<Integer> lodgingNights,
      GroupRef group,
      UUID draftGroupId,
      UUID roomId,
      UUID publishedRoomId,
      Review review) {}

  public record GroupRef(UUID groupId, String name) {}

  /** The "review again" mark (A11). Not filled in G2. */
  public record Review(List<String> reasons, Instant assignedAt) {}

  /** A participant who is not active any more but still has an assignment row. */
  public record Withdrawn(UUID participantId, String name, UUID roomId) {}

  public record BoardGroup(UUID groupId, String name, int sortOrder) {}

  /** {@code publication} of the board (api.md "숙소"). */
  public record PublicationSummary(
      Instant lastPublishedAt,
      String lastPublishedByDisplayName,
      Long lastPublishedBoardVersion,
      long activeCount,
      long eligibleCount,
      long assignedCount,
      long unassignedCount,
      long notLodgingAssignedCount,
      long changedParticipantCount,
      long roomChanges,
      boolean hasUnpublishedChanges) {}

  /** Create and edit. */
  public record RoomWritten(BoardRoom room, long boardVersion) {}

  /** Delete. {@code unassignedCount} counts the rows this deletion removed, withdrawn included. */
  public record RoomDeleted(int unassignedCount, long boardVersion) {}

  /** Reorder. */
  public record BoardVersion(long boardVersion) {}

  /** Assignment changes. {@code rooms} are the rooms people came into or left. */
  public record Assigned(
      int changed, int alreadyApplied, long boardVersion, List<RoomState> rooms) {}

  public record RoomState(UUID roomId, long memberCount, List<Warning> warnings) {}

  /**
   * {@code POST …/rooms/publish}. For {@code ALREADY_PUBLISHED} the id and time are the latest
   * publication's and the change and notification counts are 0.
   */
  public record PublishResult(
      String result,
      UUID publicationId,
      Instant publishedAt,
      long boardVersion,
      long assignedCount,
      long unassignedCount,
      long notLodgingAssignedCount,
      long changedParticipantCount,
      long roomsWithWarnings,
      long notifiedCount) {

    public static final String PUBLISHED = "PUBLISHED";
    public static final String ALREADY_PUBLISHED = "ALREADY_PUBLISHED";
  }

  /** {@code GET …/rooms/published}: the latest publication with current names. */
  public record Published(
      Instant publishedAt, List<PublishedRoom> rooms, List<PublishedUnassigned> unassigned) {}

  public record PublishedRoom(
      UUID roomId,
      String name,
      String locationNote,
      Integer capacity,
      Gender gender,
      List<PublishedMember> members) {}

  public record PublishedMember(UUID participantId, String name, String cohort) {}

  public record PublishedUnassigned(
      UUID participantId, String name, String cohort, Lodging lodging) {}
}
