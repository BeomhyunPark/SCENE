package app.scene.event.schedule;

import static app.scene.event.schedule.ScheduleFixture.write;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.event.schedule.ScheduleFixture.Person;
import app.scene.event.schedule.ScheduleFixture.World;
import app.scene.support.PostgresTestcontainer;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 식사·집회 칸이 일정표 작업본에 저절로 들어간다 (DEC-090, 로드맵 C6). 설정 저장 → 작업본 항목, 고친 항목은 그대로, 지운 항목은 되살아나지 않음, "다시
 * 넣기", 설정에서 빠진 칸, 공개 전 참가자 화면, 식수 현황의 시각과 "지남", 기존 행사 채움(V29).
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class ScheduleSlotFillHttpIT {

  /** Friday to Sunday: dinner and worship, three meals and worship, breakfast. Seven slots. */
  private static final String SCHEDULE =
      "[{\"breakfast\":false,\"lunch\":false,\"dinner\":true,\"worship\":true},"
          + "{\"breakfast\":true,\"lunch\":true,\"dinner\":true,\"worship\":true},"
          + "{\"breakfast\":true,\"lunch\":false,\"dinner\":false,\"worship\":false}]";

  /** As {@link #SCHEDULE} without day 1 worship and day 3 breakfast. */
  private static final String SHORTER =
      "[{\"breakfast\":false,\"lunch\":false,\"dinner\":true,\"worship\":false},"
          + "{\"breakfast\":true,\"lunch\":true,\"dinner\":true,\"worship\":true},"
          + "{\"breakfast\":false,\"lunch\":false,\"dinner\":false,\"worship\":false}]";

  private static final List<String> SLOTS =
      List.of(
          "opt_d1_dinner",
          "opt_d1_worship",
          "opt_d2_breakfast",
          "opt_d2_lunch",
          "opt_d2_dinner",
          "opt_d2_worship",
          "opt_d3_breakfast");

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;
  @Autowired PlatformTransactionManager transactions;

  ScheduleFixture f;

  @BeforeEach
  void setUp() {
    f = new ScheduleFixture(context, jdbc, json);
  }

  @Test
  void savingTheSetupPutsEverySlotInTheWorkingCopyAndNothingReachesParticipants() throws Exception {
    World w = f.world();
    Person garam = w.participant("가람");
    long before = w.boardVersion();

    saveSetup(w, SCHEDULE);

    JsonNode board = w.board();
    assertThat(board.get("boardVersion").asLong()).isEqualTo(before + 1);
    Map<String, JsonNode> items = bySlot(board);
    assertThat(items.keySet()).containsExactlyInAnyOrderElementsOf(SLOTS);
    JsonNode dinner = items.get("opt_d1_dinner");
    assertThat(dinner.get("title").asString()).isEqualTo("저녁");
    assertThat(dinner.get("startTime").asString()).isEqualTo("18:00");
    assertThat(dinner.get("endTime").isNull()).isTrue();
    assertThat(dinner.get("category").asString()).isEqualTo("MEAL");
    assertThat(dinner.get("audience").toString()).isEqualTo("[{\"type\":\"ALL\"}]");
    assertThat(dinner.get("day").asInt()).isEqualTo(1);
    assertThat(dinner.get("autoFilled").asBoolean()).isTrue();
    assertThat(dinner.get("publishState").asString()).isEqualTo("ADDED");
    JsonNode worship = items.get("opt_d1_worship");
    assertThat(worship.get("title").asString()).isEqualTo("집회");
    assertThat(worship.get("startTime").asString()).isEqualTo("19:30");
    assertThat(worship.get("category").asString()).isEqualTo("WORSHIP");
    assertThat(items.get("opt_d2_breakfast").get("startTime").asString()).isEqualTo("08:00");
    assertThat(items.get("opt_d2_lunch").get("startTime").asString()).isEqualTo("12:00");
    for (JsonNode slot : board.get("slots")) {
      assertThat(slot.get("linkedItemId").isNull()).as(slot.toString()).isFalse();
    }
    assertThat(board.get("publication").get("hasUnpublishedChanges").asBoolean()).isTrue();

    // Working copy only: no publication, feed version or notification.
    assertThat(w.schedule(garam).get("status").asString()).isEqualTo("NOT_PUBLISHED");
    assertThat(f.read(w.path("/schedule/published"), w.owner).get("status").asString())
        .isEqualTo("NOT_PUBLISHED");
    assertThat(w.feed()).isZero();
    assertThat(w.notificationsOf(garam)).isZero();

    // Saving again adds nothing and leaves the board version.
    saveSetup(w, SCHEDULE);
    assertThat(w.board().get("items").size()).isEqualTo(SLOTS.size());
    assertThat(w.boardVersion()).isEqualTo(before + 1);

    // Publishing shows them to participants like any item.
    w.publish(false);
    List<String> titles = new ArrayList<>();
    w.schedule(garam).get("items").forEach(item -> titles.add(item.get("title").asString()));
    assertThat(titles).contains("저녁", "집회", "아침", "점심");
  }

  @Test
  void anEditedItemIsKeptAndTheMealCountsReadItsTime() throws Exception {
    World w = f.world();
    saveSetup(w, SCHEDULE);
    JsonNode dinner = bySlot(w.board()).get("opt_d1_dinner");
    assertThat(mealSlot(w, "opt_d1_dinner").get("startTime").asString()).isEqualTo("18:00");

    w.update(
        dinner.get("itemId").asString(),
        Map.of("expectedVersion", 1, "startTime", "18:30", "title", "저녁 바비큐", "place", "식당 앞마당"));
    saveSetup(w, SCHEDULE);

    JsonNode kept = bySlot(w.board()).get("opt_d1_dinner");
    assertThat(kept.get("itemId").asString()).isEqualTo(dinner.get("itemId").asString());
    assertThat(kept.get("startTime").asString()).isEqualTo("18:30");
    assertThat(kept.get("title").asString()).isEqualTo("저녁 바비큐");
    assertThat(kept.get("place").asString()).isEqualTo("식당 앞마당");
    assertThat(kept.get("version").asInt()).isEqualTo(2);
    JsonNode counted = mealSlot(w, "opt_d1_dinner");
    assertThat(counted.get("startTime").asString()).isEqualTo("18:30");
    assertThat(counted.get("timeFromSchedule").asBoolean()).isTrue();
  }

  @Test
  void theMealCountsCallASlotPassedByTheScheduleTime() throws Exception {
    World w = f.world();
    ZoneId zone = ZoneId.of("Asia/Seoul");
    ZonedDateTime now = ZonedDateTime.now(zone);
    LocalTime clock = now.toLocalTime();
    if (!clock.isBefore(LocalTime.of(0, 57)) && clock.isBefore(LocalTime.of(1, 5))) {
      // No time on either day flips the dinner here; wait past the gap (at most 8 minutes).
      Thread.sleep(java.time.Duration.between(clock, LocalTime.of(1, 5)).toMillis() + 1000L);
      now = ZonedDateTime.now(zone);
      clock = now.toLocalTime();
    }
    // Day 1 is today, or yesterday right after midnight. The dinner's default 18:00 decides one
    // way, and the chosen time the other way.
    boolean early = clock.isBefore(LocalTime.of(0, 57));
    LocalDate first = early ? now.toLocalDate().minusDays(1) : now.toLocalDate();
    String moved;
    boolean defaultPassed;
    if (early) {
      defaultPassed = true; // yesterday 19:00
      moved = "23:59"; // passes at 00:59 today
    } else if (clock.isBefore(LocalTime.of(19, 0))) {
      defaultPassed = false;
      moved = clock.minusMinutes(70).format(DateTimeFormatter.ofPattern("HH:mm"));
    } else {
      defaultPassed = true;
      moved = "23:59"; // passes at 00:59 tomorrow
    }
    jdbc.update(
        "UPDATE events SET start_date = ?, end_date = ? WHERE id = ?",
        first,
        first.plusDays(2),
        w.eventId);
    saveSetup(w, SCHEDULE);
    assertThat(mealSlot(w, "opt_d1_dinner").get("passed").asBoolean()).isEqualTo(defaultPassed);

    JsonNode dinner = bySlot(w.board()).get("opt_d1_dinner");
    w.update(dinner.get("itemId").asString(), Map.of("expectedVersion", 1, "startTime", moved));

    JsonNode counted = mealSlot(w, "opt_d1_dinner");
    assertThat(counted.get("startTime").asString()).isEqualTo(moved);
    assertThat(counted.get("passed").asBoolean()).isEqualTo(!defaultPassed);
  }

  @Test
  void aDeletedOrUnlinkedSlotStaysOffUntilAnItemTakesItAgain() throws Exception {
    World w = f.world();
    saveSetup(w, SCHEDULE);
    Map<String, JsonNode> items = bySlot(w.board());
    w.deleteRaw(items.get("opt_d2_lunch").get("itemId").asString(), "expectedVersion=1")
        .andExpect(status().isOk());
    Map<String, Object> unlink = new HashMap<>();
    unlink.put("expectedVersion", 1);
    unlink.put("slotId", null);
    String breakfastId = items.get("opt_d2_breakfast").get("itemId").asString();
    w.update(breakfastId, unlink);

    saveSetup(w, SCHEDULE);
    JsonNode board = w.board();
    assertThat(bySlot(board)).doesNotContainKeys("opt_d2_lunch", "opt_d2_breakfast");
    assertThat(board.get("items").size()).isEqualTo(SLOTS.size() - 1);
    assertThat(linked(board, "opt_d2_lunch").isNull()).isTrue();
    // The meal counts fall back to the default time for a slot without an item.
    JsonNode lunch = mealSlot(w, "opt_d2_lunch");
    assertThat(lunch.get("startTime").asString()).isEqualTo("12:00");
    assertThat(lunch.get("timeFromSchedule").asBoolean()).isFalse();

    // The operator puts lunch back with an ordinary item linked to the slot ("+ 일정 추가"): the
    // dismissal is forgotten, the meal counts follow it, and a later save adds no second lunch.
    Map<String, Object> lunchBack = new HashMap<>(ScheduleFixture.item(2, "12:30", "점심", "ALL"));
    lunchBack.put("category", "MEAL");
    lunchBack.put("slotId", "opt_d2_lunch");
    w.create(lunchBack);
    assertThat(
            w.count(
                "SELECT count(*) FROM schedule_slot_dismissals WHERE event_id = ?"
                    + " AND slot_id = 'opt_d2_lunch'"))
        .isZero();
    assertThat(mealSlot(w, "opt_d2_lunch").get("startTime").asString()).isEqualTo("12:30");
    saveSetup(w, SCHEDULE);
    Map<String, JsonNode> back = bySlot(w.board());
    assertThat(back.get("opt_d2_lunch").get("startTime").asString()).isEqualTo("12:30");
    assertThat(back.get("opt_d2_lunch").get("autoFilled").asBoolean()).isFalse();
    // Breakfast stays off: its item is unlinked, not linked again.
    assertThat(back).doesNotContainKey("opt_d2_breakfast");
    assertThat(w.board().get("items").size()).isEqualTo(SLOTS.size());
  }

  @Test
  void aSlotLeavingTheSetupTakesOnlyItsUntouchedItem() throws Exception {
    World w = f.world();
    saveSetup(w, SCHEDULE);
    JsonNode worship = bySlot(w.board()).get("opt_d1_worship");
    w.update(worship.get("itemId").asString(), Map.of("expectedVersion", 1, "place", "대강당"));

    saveSetup(w, SHORTER);

    Map<String, JsonNode> items = bySlot(w.board());
    assertThat(items).doesNotContainKey("opt_d3_breakfast");
    JsonNode kept = items.get("opt_d1_worship");
    assertThat(kept.get("place").asString()).isEqualTo("대강당");
    assertThat(kept.get("autoFilled").asBoolean()).isTrue();
    assertThat(w.board().get("items").size()).isEqualTo(SLOTS.size() - 1);
  }

  @Test
  void anEndedEventIsNotFilled() throws Exception {
    World w = f.world();
    saveSetup(w, SCHEDULE);
    jdbc.update("DELETE FROM schedule_items WHERE event_id = ?", w.eventId);
    w.lifecycle("ENDED");
    // Whatever the setup save answers for an ended event, the schedule stays as it is.
    f.mvc.perform(
        write(put(w.path("/forms/" + w.formId + "/setup")), w.owner).content(setup(SHORTER)));
    assertThat(w.count("SELECT count(*) FROM schedule_items WHERE event_id = ?")).isZero();
  }

  /**
   * V29's fill for existing events, run again in a transaction that is rolled back: an event whose
   * setup was saved before the fill existed gets every slot, an item that already holds a slot
   * stays, and the board version rises once.
   */
  @Test
  void theMigrationFillsAnExistingEventLikeASave() throws Exception {
    World w = f.world();
    saveSetup(w, SCHEDULE);
    JsonNode dinner = bySlot(w.board()).get("opt_d1_dinner");
    w.update(dinner.get("itemId").asString(), Map.of("expectedVersion", 1, "startTime", "18:40"));
    // As before V29: the setup is there, the schedule has only the edited dinner and 집합.
    jdbc.update(
        "DELETE FROM schedule_items WHERE event_id = ? AND slot_id <> 'opt_d1_dinner'", w.eventId);
    w.create(1, "15:00", "집합", "ALL");
    jdbc.update("UPDATE schedule_items SET auto_filled = false WHERE event_id = ?", w.eventId);
    long version = w.boardVersion();

    String sql =
        new String(
            new ClassPathResource("db/migration/V29__schedule_slot_items.sql")
                .getInputStream()
                .readAllBytes(),
            StandardCharsets.UTF_8);
    String fill = sql.substring(sql.indexOf("CREATE TEMPORARY TABLE"));
    List<String> statements = new ArrayList<>();
    for (String statement : fill.split(";\\s*\\n")) {
      if (!statement.isBlank()) {
        statements.add(statement);
      }
    }
    assertThat(statements).hasSize(3);

    new TransactionTemplate(transactions)
        .executeWithoutResult(
            status -> {
              statements.forEach(jdbc::execute);
              List<Map<String, Object>> rows =
                  jdbc.queryForList(
                      "SELECT slot_id, title, to_char(start_time, 'HH24:MI') AS start_time,"
                          + " category, auto_filled, version, created_by"
                          + " FROM schedule_items WHERE event_id = ? AND slot_id IS NOT NULL",
                      w.eventId);
              Map<String, Map<String, Object>> bySlot = new HashMap<>();
              rows.forEach(row -> bySlot.put((String) row.get("slot_id"), row));
              assertThat(bySlot.keySet()).containsExactlyInAnyOrderElementsOf(SLOTS);
              assertThat(bySlot.get("opt_d1_dinner").get("start_time")).isEqualTo("18:40");
              assertThat(bySlot.get("opt_d1_dinner").get("auto_filled")).isEqualTo(false);
              Map<String, Object> worship = bySlot.get("opt_d1_worship");
              assertThat(worship.get("title")).isEqualTo("집회");
              assertThat(worship.get("start_time")).isEqualTo("19:30");
              assertThat(worship.get("category")).isEqualTo("WORSHIP");
              assertThat(worship.get("auto_filled")).isEqualTo(true);
              assertThat(worship.get("version")).isEqualTo(1);
              assertThat(worship.get("created_by")).isEqualTo(w.ownerId);
              assertThat(bySlot.get("opt_d2_lunch").get("title")).isEqualTo("점심");
              assertThat(
                      jdbc.queryForObject(
                          "SELECT version FROM schedule_boards WHERE event_id = ?",
                          Long.class,
                          w.eventId))
                  .isEqualTo(version + 1);
              status.setRollbackOnly();
            });
  }

  // ------------------------------------------------------------------ helpers

  private void saveSetup(World w, String schedule) throws Exception {
    f.mvc
        .perform(
            write(put(w.path("/forms/" + w.formId + "/setup")), w.owner).content(setup(schedule)))
        .andExpect(status().isOk());
  }

  private static String setup(String schedule) {
    return "{\"gender\":false,\"middleGroup\":false,\"cell\":false,"
        + "\"attendance\":{\"partial\":true,\"worshipOnly\":true,\"mode\":\"SLOTS\"},"
        + "\"schedule\":"
        + schedule
        + ",\"transport\":{\"groupBus\":false,\"worshipShuttle\":false,\"car\":false,"
        + "\"publicTransit\":false,\"support\":false}}";
  }

  private static Map<String, JsonNode> bySlot(JsonNode board) {
    Map<String, JsonNode> out = new HashMap<>();
    for (JsonNode item : board.get("items")) {
      if (!item.get("slotId").isNull()) {
        out.put(item.get("slotId").asString(), item);
      }
    }
    return out;
  }

  private static JsonNode linked(JsonNode board, String slotId) {
    for (JsonNode slot : board.get("slots")) {
      if (slotId.equals(slot.get("slotId").asString())) {
        return slot.get("linkedItemId");
      }
    }
    throw new AssertionError("no slot " + slotId);
  }

  private JsonNode mealSlot(World w, String slotId) throws Exception {
    JsonNode counts = f.read(w.path("/meal-counts"), w.owner);
    for (JsonNode day : counts.get("days")) {
      for (JsonNode slot : day.get("slots")) {
        if (slotId.equals(slot.get("slotId").asString())) {
          return slot;
        }
      }
    }
    throw new AssertionError("no meal slot " + slotId);
  }
}
