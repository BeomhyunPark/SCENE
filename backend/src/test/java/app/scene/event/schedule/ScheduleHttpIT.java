package app.scene.event.schedule;

import static app.scene.event.schedule.ScheduleFixture.item;
import static app.scene.event.schedule.ScheduleFixture.write;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.event.schedule.ScheduleFixture.Person;
import app.scene.event.schedule.ScheduleFixture.World;
import app.scene.support.PostgresTestcontainer;
import jakarta.servlet.http.Cookie;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Schedule working copy, publication, "save and publish" and the participant read (DEC-081,
 * schedule-contract §12, #435).
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class ScheduleHttpIT {

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;

  ScheduleFixture f;

  @BeforeEach
  void setUp() {
    f = new ScheduleFixture(context, jdbc, json);
  }

  // ------------------------------------------------------------------ working copy

  @Test
  void createsItemsWithTimesDaysAndOrder() throws Exception {
    World w = f.world();
    Map<String, Object> late = item(1, "22:00", "  찬양 집회  ", "ALL");
    late.put("endTime", "00:30");
    late.put("category", "WORSHIP");
    late.put("slotId", "opt_d1_worship");
    late.put("place", "  ");
    JsonNode created = w.create(late);
    assertThat(created.get("title").asString()).isEqualTo("찬양 집회");
    assertThat(created.get("place").isNull()).isTrue();
    assertThat(created.get("date").asString()).isEqualTo("2027-01-22");
    assertThat(created.get("endsNextDay").asBoolean()).isTrue();
    assertThat(created.get("startsAt").asString()).isEqualTo("2027-01-22T22:00:00+09:00");
    assertThat(created.get("endsAt").asString()).isEqualTo("2027-01-23T00:30:00+09:00");
    assertThat(created.get("version").asInt()).isEqualTo(1);
    assertThat(created.get("publishState").asString()).isEqualTo("ADDED");
    assertThat(created.get("updatedByDisplayName").asString()).isEqualTo("Owner");

    JsonNode a = w.create(2, "09:30", "오전 집회", "ALL");
    JsonNode b = w.create(2, "09:30", "광고", "ALL");
    w.create(1, "18:00", "저녁", "ALL");
    assertThat(a.get("sortOrder").asInt()).isZero();
    assertThat(b.get("sortOrder").asInt()).isEqualTo(1);
    assertThat(a.get("endsAt").isNull()).isTrue();

    JsonNode board = w.board();
    assertThat(board.get("eventStatus").asString()).isEqualTo("ACTIVE");
    assertThat(board.get("boardVersion").asLong()).isEqualTo(4);
    assertThat(board.get("days")).hasSize(3);
    assertThat(board.get("days").get(0).get("dayLabel").asString()).isEqualTo("1월 22일 (금)");
    assertThat(board.get("timeZone").asString()).isEqualTo("Asia/Seoul");
    List<String> titles = new ArrayList<>();
    board.get("items").forEach(i -> titles.add(i.get("title").asString()));
    assertThat(titles).containsExactly("저녁", "찬양 집회", "오전 집회", "광고");
    assertThat(board.get("publication").get("lastPublishedAt").isNull()).isTrue();
    assertThat(board.get("publication").get("hasUnpublishedChanges").asBoolean()).isTrue();
    assertThat(board.get("publication").get("pendingChanges").get("added").asInt()).isEqualTo(4);
    assertThat(board.get("slots").isNull()).isTrue();
  }

  @Test
  void rejectsInvalidFields() throws Exception {
    World w = f.world();
    List<Object[]> cases = new ArrayList<>();
    cases.add(new Object[] {"day", 4});
    cases.add(new Object[] {"day", 0});
    cases.add(new Object[] {"startTime", "24:00"});
    cases.add(new Object[] {"startTime", "9:30"});
    cases.add(new Object[] {"endTime", "09:30"});
    cases.add(new Object[] {"title", " "});
    cases.add(new Object[] {"title", "가".repeat(101)});
    cases.add(new Object[] {"place", "가".repeat(101)});
    cases.add(new Object[] {"description", "가".repeat(2001)});
    cases.add(new Object[] {"category", "PARTY"});
    cases.add(new Object[] {"audience", List.of(Map.of("type", "GROUP"))});
    cases.add(new Object[] {"audience", List.of()});
    cases.add(new Object[] {"slotId", "opt_d3_worship"});
    cases.add(new Object[] {"slotId", "opt_d2_lunch"});
    cases.add(new Object[] {"slotId", "lunch"});
    for (Object[] c : cases) {
      Map<String, Object> body = item(2, "09:30", "집회", "ALL");
      body.put("category", "WORSHIP");
      body.put((String) c[0], c[1]);
      String field = (String) c[0];
      w.createRaw(w.owner, body)
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
          .andExpect(jsonPath("$.errors[0].field").value(field));
    }
    Map<String, Object> missing = item(2, "09:30", "집회", "ALL");
    missing.remove("title");
    w.createRaw(w.owner, missing)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0].field").value("title"));
    assertThat(w.boardVersion()).isZero();
  }

  @Test
  void slotIdBelongsToOneItem() throws Exception {
    World w = f.world();
    Map<String, Object> lunch = item(2, "12:00", "점심", "ALL");
    lunch.put("category", "MEAL");
    lunch.put("slotId", "opt_d2_lunch");
    JsonNode first = w.create(lunch);
    lunch.put("title", "점심 2");
    w.createRaw(w.owner, lunch)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CONFLICT"))
        .andExpect(jsonPath("$.reason").value("SLOT_ALREADY_LINKED"))
        .andExpect(jsonPath("$.itemId").value(first.get("itemId").asString()));
    JsonNode other = w.create(2, "13:00", "산책", "ALL");
    Map<String, Object> patch = new HashMap<>();
    patch.put("expectedVersion", 1);
    patch.put("category", "MEAL");
    patch.put("slotId", "opt_d2_lunch");
    w.patchRaw(w.owner, other.get("itemId").asString(), patch)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.reason").value("SLOT_ALREADY_LINKED"));
    // Clearing frees it.
    Map<String, Object> clear = new HashMap<>();
    clear.put("expectedVersion", 1);
    clear.put("slotId", null);
    w.update(first.get("itemId").asString(), clear);
    w.update(other.get("itemId").asString(), patch);
  }

  @Test
  void concurrentEditsOfOneItemConflictAndOfTwoItemsDoNot() throws Exception {
    World w = f.world();
    Cookie manager = w.operator("MANAGER");
    String a = w.create(2, "09:30", "오전 집회", "ALL").get("itemId").asString();
    String b = w.create(2, "14:00", "레크", "ALL").get("itemId").asString();

    w.update(a, Map.of("expectedVersion", 1, "place", "대강당"));
    w.patchRaw(manager, a, Map.of("expectedVersion", 1, "place", "소강당"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CONCURRENT_MODIFICATION"))
        .andExpect(jsonPath("$.item.version").value(2))
        .andExpect(jsonPath("$.item.place").value("대강당"));

    JsonNode first = w.update(a, Map.of("expectedVersion", 2, "startTime", "10:00"));
    JsonNode second =
        f.body(
            w.patchRaw(manager, b, Map.of("expectedVersion", 1, "place", "운동장"))
                .andExpect(status().isOk()));
    assertThat(first.get("item").get("version").asInt()).isEqualTo(3);
    assertThat(second.get("item").get("place").asString()).isEqualTo("운동장");
    assertThat(w.boardVersion()).isEqualTo(5);

    // The same values again change nothing.
    JsonNode same = w.update(a, Map.of("expectedVersion", 3, "startTime", "10:00"));
    assertThat(same.get("item").get("version").asInt()).isEqualTo(3);
    assertThat(same.get("boardVersion").asLong()).isEqualTo(5);

    // Delete needs the version too.
    w.deleteRaw(a, "expectedVersion=1")
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.item.itemId").value(a));
    w.deleteRaw(a, "").andExpect(status().isBadRequest());
    w.deleteRaw(a, "expectedVersion=3")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.boardVersion").value(6))
        .andExpect(jsonPath("$.publication").isEmpty());
    w.deleteRaw(a, "expectedVersion=3").andExpect(status().isNotFound());
  }

  @Test
  void itemLimitAndMissingPeriod() throws Exception {
    World w = f.world();
    for (int i = 0; i < ScheduleService.ITEMS_MAX; i++) {
      jdbc.update(
          """
          INSERT INTO schedule_items (id, space_id, event_id, day, start_time, title, category,
            audience, sort_order, version, created_by, created_at, updated_by, updated_at)
          VALUES (gen_random_uuid(), ?, ?, 1, '08:00', 't', 'OTHER', '[{"type":"ALL"}]', ?, 1,
            ?, now(), ?, now())
          """,
          w.spaceId,
          w.eventId,
          i,
          w.ownerId,
          w.ownerId);
    }
    w.createRaw(w.owner, item(1, "09:00", "넘침", "ALL"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.reason").value("ITEM_LIMIT"));

    World x = f.world();
    jdbc.update("UPDATE events SET start_date = NULL, end_date = NULL WHERE id = ?", x.eventId);
    x.createRaw(x.owner, item(1, "09:00", "집회", "ALL"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.reason").value("EVENT_PERIOD_REQUIRED"));
    x.publishRaw(x.owner, Map.of("expectedBoardVersion", 0))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.reason").value("EVENT_PERIOD_REQUIRED"));
    assertThat(x.board().get("days")).isEmpty();
  }

  @Test
  void permissionsAndEventStates() throws Exception {
    World w = f.world();
    Cookie staff = w.operator("STAFF");
    String a = w.create(2, "09:30", "오전 집회", "ALL").get("itemId").asString();
    // STAFF reads the working copy and the published view but cannot write.
    f.read(w.path("/schedule"), staff);
    f.read(w.path("/schedule/published"), staff);
    w.createRaw(staff, item(1, "09:00", "x", "ALL"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    w.patchRaw(staff, a, Map.of("expectedVersion", 1, "title", "y"))
        .andExpect(status().isForbidden());
    w.publishRaw(staff, Map.of("expectedBoardVersion", 1)).andExpect(status().isForbidden());
    // A MANAGER writes by default; a REVOKE takes it away.
    Cookie manager = w.operator("MANAGER");
    w.createRaw(manager, item(1, "09:00", "아침", "ALL")).andExpect(status().isCreated());
    // Stranger.
    Cookie stranger = f.login(newUser());
    f.mvc.perform(get(w.path("/schedule")).cookie(stranger)).andExpect(status().isNotFound());

    Person p = w.participant("가");
    w.publish();
    w.lifecycle("ENDED");
    w.createRaw(w.owner, item(1, "09:00", "x", "ALL"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("EVENT_ENDED"));
    w.patchRaw(w.owner, a, Map.of("expectedVersion", 1, "title", "y"))
        .andExpect(jsonPath("$.code").value("EVENT_ENDED"));
    w.deleteRaw(a, "expectedVersion=1").andExpect(jsonPath("$.code").value("EVENT_ENDED"));
    w.publishRaw(w.owner, Map.of("expectedBoardVersion", w.boardVersion()))
        .andExpect(jsonPath("$.code").value("EVENT_ENDED"));
    // Reads and the participant keep the last publication.
    assertThat(w.board().get("eventStatus").asString()).isEqualTo("ENDED");
    assertThat(w.schedule(p).get("items")).hasSize(2);
    w.lifecycle("ARCHIVED");
    w.createRaw(w.owner, item(1, "09:00", "x", "ALL"))
        .andExpect(jsonPath("$.code").value("EVENT_ARCHIVED"));
    assertThat(w.schedule(p).get("status").asString()).isEqualTo("PUBLISHED");
  }

  private java.util.UUID newUser() {
    java.util.UUID id = java.util.UUID.randomUUID();
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, 'Stranger')", id);
    return id;
  }

  // ------------------------------------------------------------------ publication

  @Test
  void savingIsInvisibleAndPublishingRaisesTheFeedOnce() throws Exception {
    World w = f.world();
    Person p = w.participant("가");
    JsonNode a = w.create(2, "09:30", "오전 집회", "ALL");
    assertThat(w.feed()).isZero();
    assertThat(w.schedule(p).get("status").asString()).isEqualTo("NOT_PUBLISHED");
    assertThat(w.schedule(p).get("days")).hasSize(3);
    f.read("/api/v1/operator/events/" + w.eventId + "/schedule/published", w.owner);

    JsonNode first = w.publish();
    assertThat(first.get("result").asString()).isEqualTo("PUBLISHED");
    assertThat(first.get("changes").get("added")).hasSize(1);
    assertThat(first.get("notifiedCount").asInt()).isEqualTo(1);
    assertThat(w.feed()).isEqualTo(1);
    JsonNode seen = w.schedule(p);
    assertThat(seen.get("status").asString()).isEqualTo("PUBLISHED");
    assertThat(seen.get("items").get(0).get("change").isNull()).isTrue();
    assertThat(seen.get("items").get(0).has("audience")).isFalse();
    assertThat(seen.get("items").get(0).get("leadersOnly").asBoolean()).isFalse();
    assertThat(f.read("/api/v1/participant/updates", p.session()).get("schedule").asLong())
        .isEqualTo(1);

    // Working-copy saves do not touch the participant or the feed.
    w.update(a.get("itemId").asString(), Map.of("expectedVersion", 1, "startTime", "10:00"));
    assertThat(w.feed()).isEqualTo(1);
    assertThat(w.schedule(p).get("items").get(0).get("startTime").asString()).isEqualTo("09:30");
    JsonNode board = w.board();
    assertThat(board.get("items").get(0).get("publishState").asString()).isEqualTo("CHANGED");
    assertThat(board.get("publication").get("pendingChanges").get("changed").asInt()).isEqualTo(1);

    // Back to the published value: UNCHANGED again, publish is ALREADY_PUBLISHED.
    w.update(a.get("itemId").asString(), Map.of("expectedVersion", 2, "startTime", "09:30"));
    assertThat(w.board().get("items").get(0).get("publishState").asString()).isEqualTo("UNCHANGED");
    int audits = w.count("SELECT count(*) FROM audit_logs WHERE event_id = ?");
    int publications = w.count("SELECT count(*) FROM schedule_publications WHERE event_id = ?");
    int notifications = w.count("SELECT count(*) FROM notifications WHERE event_id = ?");
    JsonNode again = w.publish();
    assertThat(again.get("result").asString()).isEqualTo("ALREADY_PUBLISHED");
    assertThat(again.get("publicationId").asString())
        .isEqualTo(first.get("publicationId").asString());
    assertThat(again.get("notifiedCount").asInt()).isZero();
    assertThat(again.get("changes").get("changed")).isEmpty();
    assertThat(w.feed()).isEqualTo(1);
    assertThat(w.count("SELECT count(*) FROM audit_logs WHERE event_id = ?")).isEqualTo(audits);
    assertThat(w.count("SELECT count(*) FROM schedule_publications WHERE event_id = ?"))
        .isEqualTo(publications);
    assertThat(w.count("SELECT count(*) FROM notifications WHERE event_id = ?"))
        .isEqualTo(notifications);

    // A real change publishes, raises the feed by exactly one and audits once.
    w.update(a.get("itemId").asString(), Map.of("expectedVersion", 3, "place", "대강당"));
    JsonNode changed = w.publish();
    assertThat(changed.get("result").asString()).isEqualTo("PUBLISHED");
    assertThat(changed.get("changes").get("changed").get(0).get("fields").get(0).asString())
        .isEqualTo("place");
    assertThat(w.feed()).isEqualTo(2);
    JsonNode audit =
        json.readTree(
            jdbc.queryForObject(
                "SELECT detail::text FROM audit_logs WHERE event_id = ? AND action ="
                    + " 'SCHEDULE_PUBLISHED' ORDER BY occurred_at DESC LIMIT 1",
                String.class,
                w.eventId));
    assertThat(audit.get("changed").asInt()).isEqualTo(1);
    assertThat(audit.get("notify").asBoolean()).isTrue();
    assertThat(audit.toString()).doesNotContain("대강당").doesNotContain("오전 집회");
    assertThat(w.count("SELECT count(*) FROM audit_logs WHERE event_id = ?")).isEqualTo(audits + 1);

    // A stale board version is refused.
    w.publishRaw(w.owner, Map.of("expectedBoardVersion", 0))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CONCURRENT_MODIFICATION"))
        .andExpect(jsonPath("$.boardVersion").value(w.boardVersion()));
    w.publishRaw(w.owner, Map.of())
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0].field").value("expectedBoardVersion"));
  }

  @Test
  void changeMarksAndRemovedItems() throws Exception {
    World w = f.world();
    Person p = w.participant("가");
    Map<String, Object> body = item(2, "09:00", "오전 집회", "ALL");
    body.put("place", "소강당");
    String a = w.create(body).get("itemId").asString();
    String walk = w.create(2, "15:00", "산책", "ALL").get("itemId").asString();
    w.publish();

    w.update(a, Map.of("expectedVersion", 1, "startTime", "09:30", "place", "대강당"));
    w.deleteRaw(walk, "expectedVersion=1").andExpect(status().isOk());
    String rec = w.create(2, "14:00", "레크리에이션", "ALL").get("itemId").asString();
    JsonNode result = w.publish();
    assertThat(result.get("changes").get("added").get(0).get("title").asString())
        .isEqualTo("레크리에이션");
    assertThat(result.get("changes").get("removed").get(0).get("itemId").asString())
        .isEqualTo(walk);

    JsonNode seen = w.schedule(p);
    Map<String, JsonNode> byId = new HashMap<>();
    seen.get("items").forEach(i -> byId.put(i.get("itemId").asString(), i));
    JsonNode change = byId.get(a).get("change");
    assertThat(change.get("kind").asString()).isEqualTo("CHANGED");
    assertThat(change.get("fields").toString()).isEqualTo("[\"startTime\",\"place\"]");
    assertThat(change.get("previous").get("startTime").asString()).isEqualTo("09:00");
    assertThat(change.get("previous").get("place").asString()).isEqualTo("소강당");
    assertThat(byId.get(rec).get("change").get("kind").asString()).isEqualTo("ADDED");
    assertThat(seen.get("removedItems")).hasSize(1);
    assertThat(seen.get("removedItems").get(0).get("title").asString()).isEqualTo("산책");
    assertThat(seen.get("removedItems").get(0).get("date").asString()).isEqualTo("2027-01-23");

    // A second change within 24 hours keeps the first previous value; changing back drops it.
    String changedAt = change.get("changedAt").asString();
    w.update(a, Map.of("expectedVersion", 2, "startTime", "10:00", "place", "소강당"));
    w.publish();
    JsonNode merged = find(w.schedule(p), a).get("change");
    assertThat(merged.get("fields").toString()).isEqualTo("[\"startTime\"]");
    assertThat(merged.get("previous").get("startTime").asString()).isEqualTo("09:00");
    assertThat(merged.get("changedAt").asString()).isNotEqualTo(changedAt);
    // The removed item is carried over into the next snapshot.
    assertThat(w.schedule(p).get("removedItems")).hasSize(1);

    // Older than 24 hours: no mark, no removed item.
    jdbc.update(
        "UPDATE schedule_publications SET snapshot = regexp_replace(snapshot::text,"
            + " '\"(changedAt|removedAt)\": ?\"[^\"]+\"', '\"\\1\":\"2020-01-01T00:00:00Z\"',"
            + " 'g')::jsonb WHERE event_id = ?",
        w.eventId);
    JsonNode old = w.schedule(p);
    assertThat(find(old, a).get("change").isNull()).isTrue();
    assertThat(old.get("removedItems")).isEmpty();
  }

  private static JsonNode find(JsonNode schedule, String itemId) {
    for (JsonNode item : schedule.get("items")) {
      if (item.get("itemId").asString().equals(itemId)) {
        return item;
      }
    }
    throw new AssertionError("no item " + itemId);
  }

  // ------------------------------------------------------------------ save and publish

  @Test
  void saveAndPublishAsksAboutOtherChangesAndCommitsTogether() throws Exception {
    World w = f.world();
    Person p = w.participant("가");
    String a = w.create(2, "09:30", "오전 집회", "ALL").get("itemId").asString();
    String b = w.create(2, "14:00", "레크", "ALL").get("itemId").asString();
    w.publish();
    long feed = w.feed();

    // Someone else's unpublished change on b.
    w.update(b, Map.of("expectedVersion", 1, "place", "운동장"));
    long boardVersion = w.boardVersion();
    Map<String, Object> mine = new HashMap<>();
    mine.put("expectedVersion", 1);
    mine.put("startTime", "10:00");
    mine.put("publish", true);
    w.patchRaw(w.owner, a, mine)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CONFIRMATION_REQUIRED"))
        .andExpect(jsonPath("$.otherChanges.changed[0].itemId").value(b))
        .andExpect(jsonPath("$.otherChanges.changed[0].title").value("레크"))
        .andExpect(jsonPath("$.otherChanges.added").isEmpty());
    // Nothing was saved.
    assertThat(w.boardVersion()).isEqualTo(boardVersion);
    assertThat(find(w.board(), a).get("version").asInt()).isEqualTo(1);
    assertThat(w.feed()).isEqualTo(feed);

    mine.put("confirmOtherChanges", true);
    JsonNode saved = w.update(a, mine);
    assertThat(saved.get("item").get("startTime").asString()).isEqualTo("10:00");
    assertThat(saved.get("item").get("publishState").asString()).isEqualTo("UNCHANGED");
    assertThat(saved.get("publication").get("result").asString()).isEqualTo("PUBLISHED");
    assertThat(saved.get("publication").get("boardVersion").asLong())
        .isEqualTo(saved.get("boardVersion").asLong());
    assertThat(saved.get("publication").get("changes").get("changed")).hasSize(2);
    assertThat(w.feed()).isEqualTo(feed + 1);
    assertThat(find(w.schedule(p), a).get("startTime").asString()).isEqualTo("10:00");
    assertThat(find(w.schedule(p), b).get("place").asString()).isEqualTo("운동장");

    // Without other changes no confirmation is needed: create and delete with publish.
    Map<String, Object> created = item(3, "08:00", "아침", "ALL");
    created.put("publish", true);
    created.put("notify", false);
    JsonNode c = f.body(w.createRaw(w.owner, created).andExpect(status().isCreated()));
    assertThat(c.get("publication").get("result").asString()).isEqualTo("PUBLISHED");
    assertThat(c.get("publication").get("notifiedCount").asInt()).isZero();
    String cid = c.get("item").get("itemId").asString();
    f.body(
        w.deleteRaw(cid, "expectedVersion=1&publish=true")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.publication.result").value("PUBLISHED"))
            .andExpect(jsonPath("$.publication.changes.removed[0].itemId").value(cid)));
    assertThat(w.feed()).isEqualTo(feed + 3);
    w.deleteRaw(b, "expectedVersion=2&publish=yes")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0].field").value("publish"));
  }

  @Test
  void failingPublicationRollsTheSaveBack() throws Exception {
    World w = f.world();
    Person p = w.participant("가");
    String a = w.create(3, "09:30", "마지막 날 집회", "ALL").get("itemId").asString();
    String b = w.create(1, "18:00", "저녁", "ALL").get("itemId").asString();
    w.publish();
    // The event gets shorter: the day-3 item is outside the period.
    jdbc.update("UPDATE events SET end_date = DATE '2027-01-23' WHERE id = ?", w.eventId);
    assertThat(find(w.board(), a).get("outOfPeriod").asBoolean()).isTrue();
    long feed = w.feed();
    long boardVersion = w.boardVersion();
    int notifications = w.notificationsOf(p);

    Map<String, Object> body = new HashMap<>();
    body.put("expectedVersion", 1);
    body.put("place", "식당");
    body.put("publish", true);
    body.put("confirmOtherChanges", true);
    w.patchRaw(w.owner, b, body)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.reason").value("ITEMS_OUT_OF_PERIOD"))
        .andExpect(jsonPath("$.itemIds[0]").value(a));
    assertThat(find(w.board(), b).get("place").isNull()).isTrue();
    assertThat(w.boardVersion()).isEqualTo(boardVersion);
    assertThat(w.feed()).isEqualTo(feed);
    assertThat(w.notificationsOf(p)).isEqualTo(notifications);
    assertThat(find(w.schedule(p), b).get("place").isNull()).isTrue();

    // Moving the item back into the period lets it publish.
    w.update(a, Map.of("expectedVersion", 1, "day", 2));
    assertThat(w.publish().get("result").asString()).isEqualTo("PUBLISHED");
  }

  // ------------------------------------------------------------------ audience

  @Test
  void audienceFiltersLeadersStaffAndWithdrawnParticipants() throws Exception {
    World w = f.world();
    Person leader = w.participant("조장");
    Person member = w.participant("조원");
    Person gone = w.participant("취소");
    String group = w.createGroup("1조");
    w.assign(leader.id(), group);
    w.assign(member.id(), group);
    w.leaders(group, leader.id());
    w.publishGroups();

    w.create(1, "18:00", "저녁", "ALL");
    String leaders = w.create(1, "21:00", "조장 모임", "LEADERS").get("itemId").asString();
    w.create(1, "22:00", "운영진 회의", "STAFF");
    w.withdraw(gone);
    JsonNode first = w.publish();
    assertThat(first.get("notifiedCount").asInt()).isEqualTo(2);

    JsonNode forLeader = w.schedule(leader);
    assertThat(forLeader.get("items")).hasSize(2);
    assertThat(find(forLeader, leaders).get("leadersOnly").asBoolean()).isTrue();
    JsonNode forMember = w.schedule(member);
    assertThat(forMember.get("items")).hasSize(1);
    assertThat(forMember.toString()).doesNotContain("조장 모임").doesNotContain("운영진 회의");
    // A withdrawn participant's session no longer counts (DEC-084 §4): 401 before the schedule.
    f.mvc
        .perform(get("/api/v1/participant/schedule").cookie(gone.session()))
        .andExpect(status().isUnauthorized());
    assertThat(w.notificationsOf(gone)).isZero();

    // The operator published view has every item with its audience.
    JsonNode published = f.read(w.path("/schedule/published"), w.owner);
    assertThat(published.get("items")).hasSize(3);
    assertThat(published.get("items").get(2).get("audience").get(0).get("type").asString())
        .isEqualTo("STAFF");

    // The leader is cleared by a later group publication: the item disappears on the next read.
    w.leaders(group);
    w.publishGroups();
    assertThat(w.schedule(leader).get("items")).hasSize(1);
  }

  @Test
  void notificationsFollowWhoCanSeeTheChange() throws Exception {
    World w = f.world();
    Person leader = w.participant("조장");
    Person member = w.participant("조원");
    String group = w.createGroup("1조");
    w.assign(leader.id(), group);
    w.leaders(group, leader.id());
    w.publishGroups();
    String all = w.create(2, "09:30", "오전 집회", "ALL").get("itemId").asString();
    String lead = w.create(2, "21:00", "조장 모임", "LEADERS").get("itemId").asString();
    String staff = w.create(2, "07:00", "운영진 회의", "STAFF").get("itemId").asString();
    w.publish();
    JsonNode firstList = f.read("/api/v1/participant/notifications", member.session());
    assertThat(firstList.get("items")).hasSize(1);
    JsonNode published = firstList.get("items").get(0);
    assertThat(published.get("kind").asString()).isEqualTo("SCHEDULE_PUBLISHED");
    assertThat(published.get("target").get("type").asString()).isEqualTo("SCHEDULE");
    assertThat(published.get("target").get("id").isNull()).isTrue();

    // STAFF only: nobody.
    w.update(staff, Map.of("expectedVersion", 1, "place", "사무실"));
    assertThat(w.publish().get("notifiedCount").asInt()).isZero();

    // LEADERS only: the leader.
    w.update(lead, Map.of("expectedVersion", 1, "place", "카페"));
    assertThat(w.publish().get("notifiedCount").asInt()).isEqualTo(1);
    assertThat(w.notificationsOf(member)).isEqualTo(1);
    JsonNode leaderNote = latest(leader);
    assertThat(leaderNote.get("kind").asString()).isEqualTo("SCHEDULE_CHANGED");
    assertThat(leaderNote.get("body").asString()).isEqualTo("조장 모임");

    // ALL: everyone; the leader's body lists the leader item too. Unread rows merge.
    w.update(all, Map.of("expectedVersion", 1, "startTime", "10:00"));
    w.update(lead, Map.of("expectedVersion", 2, "startTime", "21:30"));
    assertThat(w.publish().get("notifiedCount").asInt()).isEqualTo(2);
    assertThat(latest(member).get("body").asString()).isEqualTo("오전 집회");
    JsonNode merged = latest(leader);
    assertThat(merged.get("body").asString()).isEqualTo("오전 집회, 조장 모임");
    assertThat(merged.get("count").asInt()).isEqualTo(2);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM notifications WHERE recipient_participant_id = ? AND kind ="
                    + " 'SCHEDULE_CHANGED'",
                Integer.class,
                leader.id()))
        .isEqualTo(1);

    // notify: false makes none; more than three titles say "외 N건".
    w.update(all, Map.of("expectedVersion", 2, "place", "강당"));
    assertThat(w.publish(false).get("notifiedCount").asInt()).isZero();
    for (int i = 0; i < 4; i++) {
      w.create(3, "1" + i + ":00", "항목" + i, "ALL");
    }
    w.publish();
    assertThat(latest(member).get("body").asString()).isEqualTo("항목0, 항목1, 항목2 외 1건");

    // Reading by target with no id marks the schedule notifications read.
    f.mvc
        .perform(
            write(post("/api/v1/participant/notifications/read"), member.session())
                .content("{\"target\":{\"type\":\"SCHEDULE\",\"id\":null}}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.unreadCount").value(0));
  }

  private JsonNode latest(Person person) throws Exception {
    return f.read("/api/v1/participant/notifications", person.session()).get("items").get(0);
  }

  // ------------------------------------------------------------------ participant access

  @Test
  void participantPathNeedsAParticipantSession() throws Exception {
    World w = f.world();
    Person p = w.participant("가");
    f.mvc
        .perform(get("/api/v1/participant/schedule").cookie(p.session()))
        .andExpect(status().isOk())
        .andExpect(header().string("Cache-Control", "no-store"));
    f.mvc
        .perform(get("/api/v1/participant/schedule"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
    f.mvc
        .perform(get("/api/v1/participant/schedule").cookie(w.owner))
        .andExpect(status().isUnauthorized());
    jdbc.update("UPDATE participants SET pin_temporary = true WHERE id = ?", p.id());
    f.mvc
        .perform(get("/api/v1/participant/schedule").cookie(p.session()))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("PARTICIPANT_PIN_CHANGE_REQUIRED"));
    int audits = w.count("SELECT count(*) FROM audit_logs WHERE event_id = ?");
    jdbc.update("UPDATE participants SET pin_temporary = false WHERE id = ?", p.id());
    w.schedule(p);
    assertThat(w.count("SELECT count(*) FROM audit_logs WHERE event_id = ?")).isEqualTo(audits);
  }
}
