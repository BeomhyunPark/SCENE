package app.scene.event.schedule;

import app.scene.event.audience.Audience;
import app.scene.event.schedule.mapper.ScheduleMapper;
import app.scene.event.schedule.param.ScheduleParam;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * {@code schedule_boards}, {@code schedule_items} and {@code schedule_publications}, scoped by
 * space and event. Writers hold the event row lock.
 */
@Component
class ScheduleRepository {

  private final ScheduleMapper schedule;
  private final JsonMapper json;

  ScheduleRepository(ScheduleMapper schedule, JsonMapper json) {
    this.schedule = schedule;
    this.json = json;
  }

  /** 0 before the first change. */
  long boardVersion(UUID spaceId, UUID eventId) {
    Long version = schedule.findBoardVersion(ScheduleParam.of(spaceId, eventId));
    return version == null ? 0 : version;
  }

  /** Adds 1 to the board version and returns the new value. */
  long bumpBoardVersion(UUID spaceId, UUID eventId, Instant at) {
    return schedule.bumpBoardVersion(ScheduleParam.of(spaceId, eventId).at(at));
  }

  /** Every item in schedule order. */
  List<ScheduleItemRow> items(UUID spaceId, UUID eventId) {
    return schedule.findItems(ScheduleParam.of(spaceId, eventId));
  }

  Optional<ScheduleItemRow> find(UUID spaceId, UUID eventId, UUID itemId) {
    return schedule.findItems(ScheduleParam.of(spaceId, eventId).item(itemId)).stream().findFirst();
  }

  /** Another item holding {@code slotId}, if any. */
  Optional<UUID> slotOwner(UUID spaceId, UUID eventId, String slotId, UUID exceptItemId) {
    return Optional.ofNullable(
        schedule.findSlotOwner(ScheduleParam.of(spaceId, eventId).slot(slotId).item(exceptItemId)));
  }

  /** The end of the items at that day and start time. */
  int nextSortOrder(UUID spaceId, UUID eventId, int day, String startTime) {
    return schedule.nextSortOrder(ScheduleParam.of(spaceId, eventId).time(day, startTime));
  }

  void insert(UUID spaceId, UUID eventId, UUID itemId, ItemContent c, UUID actorId, Instant at) {
    requireOne(schedule.insertItem(param(spaceId, eventId, itemId, c).actor(actorId, at)));
  }

  void update(UUID spaceId, UUID eventId, UUID itemId, ItemContent c, UUID actorId, Instant at) {
    requireOne(schedule.updateItem(param(spaceId, eventId, itemId, c).actor(actorId, at)));
  }

  void delete(UUID spaceId, UUID eventId, UUID itemId) {
    requireOne(schedule.deleteItem(ScheduleParam.of(spaceId, eventId).item(itemId)));
  }

  /** The latest publication by insertion order, or empty before the first one. */
  Optional<LatestPublication> latestPublication(UUID spaceId, UUID eventId) {
    SchedulePublicationRow row = schedule.findLatestPublication(ScheduleParam.of(spaceId, eventId));
    if (row == null) {
      return Optional.empty();
    }
    return Optional.of(
        new LatestPublication(
            row.publicationId(),
            row.boardVersion(),
            row.publishedAt(),
            row.publishedByDisplayName(),
            snapshot(row.snapshot())));
  }

  void insertPublication(
      UUID spaceId,
      UUID eventId,
      UUID publicationId,
      long boardVersion,
      ScheduleSnapshot snapshot,
      ScheduleChanges changes,
      UUID actorId,
      Instant at) {
    schedule.insertPublication(
        ScheduleParam.of(spaceId, eventId)
            .publication(
                publicationId,
                boardVersion,
                json.writeValueAsString(snapshot),
                json.writeValueAsString(changes))
            .actor(actorId, at));
  }

  /** Event period and latest snapshot in one statement, or null when the event row is gone. */
  ParticipantScheduleRow participantView(UUID spaceId, UUID eventId) {
    return schedule.findParticipantSchedule(ScheduleParam.of(spaceId, eventId));
  }

  ScheduleSnapshot snapshot(String text) {
    return text == null ? ScheduleSnapshot.EMPTY : json.readValue(text, ScheduleSnapshot.class);
  }

  /** The content of a row. */
  ItemContent content(ScheduleItemRow row) {
    return new ItemContent(
        row.day(),
        row.startTime(),
        row.endTime(),
        row.title(),
        row.place(),
        row.description(),
        row.category(),
        Audience.read(json, row.audience()),
        row.slotId(),
        row.sortOrder());
  }

  /** The content of a published item. */
  ItemContent content(ScheduleSnapshot.Item item) {
    return new ItemContent(
        item.day(),
        item.startTime(),
        item.endTime(),
        item.title(),
        item.place(),
        item.description(),
        item.category(),
        audience(item.audience()),
        item.slotId(),
        item.sortOrder());
  }

  Audience audience(tools.jackson.databind.JsonNode node) {
    return Audience.read(json, node == null ? null : node.toString());
  }

  private ScheduleParam param(UUID spaceId, UUID eventId, UUID itemId, ItemContent c) {
    return ScheduleParam.of(spaceId, eventId)
        .item(itemId)
        .content(
            c.day(),
            c.startTime(),
            c.endTime(),
            c.title(),
            c.place(),
            c.description(),
            c.category(),
            c.audience().toJson(json),
            c.slotId(),
            c.sortOrder());
  }

  private static void requireOne(int rows) {
    if (rows != 1) {
      throw new IllegalStateException("locked schedule row changed");
    }
  }

  /** The latest publication with its snapshot read back. */
  record LatestPublication(
      UUID publicationId,
      long boardVersion,
      Instant publishedAt,
      String publishedByDisplayName,
      ScheduleSnapshot snapshot) {}
}
