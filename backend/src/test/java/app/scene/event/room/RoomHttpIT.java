package app.scene.event.room;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.web.RequestIdFilter;
import app.scene.support.ParticipantSessions;
import app.scene.support.PostgresTestcontainer;
import jakarta.servlet.http.Cookie;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers;
import org.springframework.session.web.http.SessionRepositoryFilter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Rooms (#457, DEC-085). Each test names the condition of api.md "숙소" 시험 조건 it covers (§15 numbers
 * of the former contract draft). The form is stored by SQL so each case controls exactly which
 * questions exist; the setup holds a two-night period (2027-01-22 to 01-24), so a full attendee
 * sleeps nights 1 and 2.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class RoomHttpIT {

  private static final String OPERATOR_COOKIE = "SCENE_SESSION";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";
  private static final String MY_ROOMS = "/api/v1/participant/rooms";

  private static final String GENDER_OPTIONS =
      "{\"options\":[{\"optionId\":\"opt_male\",\"label\":\"남\",\"hidden\":false},"
          + "{\"optionId\":\"opt_female\",\"label\":\"여\",\"hidden\":false},"
          + "{\"optionId\":\"opt_gone\",\"label\":\"꺼진 보기\",\"hidden\":true}]}";
  private static final String ATTENDANCE_OPTIONS =
      "{\"options\":[{\"optionId\":\"opt_full\",\"label\":\"전체\"},"
          + "{\"optionId\":\"opt_partial\",\"label\":\"부분\"},"
          + "{\"optionId\":\"opt_worship\",\"label\":\"집회만\"}]}";
  private static final String LODGING_OPTIONS =
      "{\"options\":[{\"optionId\":\"opt_n1\",\"label\":\"첫째 밤\"},"
          + "{\"optionId\":\"opt_n2\",\"label\":\"둘째 밤\"}]}";
  private static final String NO_LODGING_OPTIONS =
      "{\"options\":[{\"optionId\":\"opt_no_lodging\",\"label\":\"숙박 안 함\"}]}";
  private static final String FULL = "{\"optionId\":\"opt_full\"}";
  private static final String PARTIAL = "{\"optionId\":\"opt_partial\"}";
  private static final String WORSHIP = "{\"optionId\":\"opt_worship\"}";

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;

  MockMvc mvc;

  @BeforeEach
  void mockMvc() {
    mvc =
        MockMvcBuilders.webAppContextSetup(context)
            .addFilters(
                context.getBean(RequestIdFilter.class),
                context.getBean(SessionRepositoryFilter.class))
            .apply(SecurityMockMvcConfigurers.springSecurity())
            .build();
  }

  /** Room CRUD: the room object, field rules, name and order rules, and the board version. */
  @Test
  void roomsAreCreatedEditedOrderedAndValidated() throws Exception {
    World w = world();
    w.lodgingQuestions();
    w.preset("GENDER", "SINGLE_CHOICE", GENDER_OPTIONS);
    JsonNode created =
        json.readTree(
            created(
                write(
                    post(roomsPath(w)),
                    w.owner,
                    "{\"name\":\"  301호 \",\"locationNote\":\"본관 3층\",\"capacity\":6,"
                        + "\"genderOptionId\":\"opt_male\"}")));
    assertThat(created.propertyNames()).containsExactly("room", "boardVersion");
    JsonNode room = created.get("room");
    assertThat(room.propertyNames())
        .containsExactly(
            "roomId",
            "name",
            "locationNote",
            "capacity",
            "gender",
            "sortOrder",
            "version",
            "memberCount",
            "warnings");
    assertThat(room.get("name").asString()).isEqualTo("301호");
    assertThat(room.get("gender").toString())
        .isEqualTo("{\"optionId\":\"opt_male\",\"label\":\"남\"}");
    assertThat(room.get("version").asInt()).isZero();
    assertThat(created.get("boardVersion").asLong()).isEqualTo(1);
    String r1 = room.get("roomId").asString();
    String r2 = createRoom(w, "302호", null, null);
    JsonNode second = board(w).get("rooms").get(1);
    assertThat(second.get("locationNote").isNull()).isTrue();
    assertThat(second.get("capacity").isNull()).isTrue();
    assertThat(second.get("gender").isNull()).isTrue();
    assertThat(second.get("sortOrder").asInt()).isEqualTo(1);

    // Field rules.
    problem(write(post(roomsPath(w)), w.owner, "{\"name\":\"  \"}"), 400, "VALIDATION_FAILED")
        .andExpect(jsonPath("$.errors[0].field").value("name"));
    problem(
            write(post(roomsPath(w)), w.owner, "{\"name\":\"A\",\"capacity\":51}"),
            400,
            "VALIDATION_FAILED")
        .andExpect(jsonPath("$.errors[0].field").value("capacity"));
    problem(
            write(
                post(roomsPath(w)),
                w.owner,
                "{\"name\":\"A\",\"locationNote\":\"" + "가".repeat(101) + "\"}"),
            400,
            "VALIDATION_FAILED")
        .andExpect(jsonPath("$.errors[0].field").value("locationNote"));
    problem(
            write(post(roomsPath(w)), w.owner, "{\"name\":\"A\",\"genderOptionId\":\"opt_x\"}"),
            400,
            "VALIDATION_FAILED")
        .andExpect(jsonPath("$.errors[0].field").value("genderOptionId"));
    problem(write(post(roomsPath(w)), w.owner, "{\"name\":\"301호\"}"), 409, "CONFLICT");

    // Edit: only given keys change, null clears, the same values change nothing.
    JsonNode edited =
        json.readTree(
            ok(
                write(
                    patch(roomsPath(w) + "/" + r1),
                    w.owner,
                    "{\"capacity\":8,\"locationNote\":\"\",\"expectedVersion\":0}")));
    assertThat(edited.get("room").get("capacity").asInt()).isEqualTo(8);
    assertThat(edited.get("room").get("locationNote").isNull()).isTrue();
    assertThat(edited.get("room").get("name").asString()).isEqualTo("301호");
    assertThat(edited.get("room").get("version").asInt()).isEqualTo(1);
    long version = edited.get("boardVersion").asLong();
    JsonNode same =
        json.readTree(
            ok(
                write(
                    patch(roomsPath(w) + "/" + r1),
                    w.owner,
                    "{\"capacity\":8,\"expectedVersion\":1}")));
    assertThat(same.get("boardVersion").asLong()).isEqualTo(version);
    assertThat(same.get("room").get("version").asInt()).isEqualTo(1);
    problem(
            write(
                patch(roomsPath(w) + "/" + r1), w.owner, "{\"capacity\":7,\"expectedVersion\":0}"),
            409,
            "CONCURRENT_MODIFICATION")
        .andExpect(jsonPath("$.version").value(1));
    problem(
            write(patch(roomsPath(w) + "/" + r1), w.owner, "{\"capacity\":7}"),
            400,
            "VALIDATION_FAILED")
        .andExpect(jsonPath("$.errors[0].field").value("expectedVersion"));
    problem(
        write(patch(roomsPath(w) + "/" + r1), w.owner, "{\"name\":\"302호\",\"expectedVersion\":1}"),
        409,
        "CONFLICT");
    problem(
        write(patch(roomsPath(w) + "/" + UUID.randomUUID()), w.owner, "{\"expectedVersion\":0}"),
        404,
        "RESOURCE_NOT_FOUND");

    // Order: the full list exactly once each.
    JsonNode ordered =
        json.readTree(ok(write(put(roomsPath(w) + "/order"), w.owner, ids("roomIds", r2, r1))));
    assertThat(ordered.get("boardVersion").asLong()).isEqualTo(version + 1);
    assertThat(board(w).get("rooms").get(0).get("roomId").asString()).isEqualTo(r2);
    JsonNode unchanged =
        json.readTree(ok(write(put(roomsPath(w) + "/order"), w.owner, ids("roomIds", r2, r1))));
    assertThat(unchanged.get("boardVersion").asLong()).isEqualTo(version + 1);
    problem(write(put(roomsPath(w) + "/order"), w.owner, ids("roomIds", r2)), 409, "CONFLICT");
    problem(write(put(roomsPath(w) + "/order"), w.owner, ids("roomIds", r2, r2)), 409, "CONFLICT");

    // Delete with the version in the query.
    problem(write(delete(roomsPath(w) + "/" + r2), w.owner, null), 400, "VALIDATION_FAILED");
    JsonNode deleted =
        json.readTree(
            ok(write(delete(roomsPath(w) + "/" + r2 + "?expectedVersion=0"), w.owner, null)));
    assertThat(deleted.get("unassignedCount").asInt()).isZero();
    assertThat(board(w).get("rooms")).hasSize(1);
  }

  /**
   * §15.1, §15.2: working-copy saves change nothing participants or leaders see; a publication
   * changes all of it and raises {@code updates.rooms} by exactly 1; the same publication again is
   * {@code ALREADY_PUBLISHED} and leaves nothing.
   */
  @Test
  void workingCopyIsInvisibleUntilPublishedAndRepublishingChangesNothing() throws Exception {
    World w = world();
    w.lodgingQuestions();
    Person lead = w.participant("가조장", "010-8000-0001", "90", FULL);
    Person mate = w.participant("나조원", "010-8000-0002", "91", FULL);
    String g1 = createGroup(w, "1조");
    ok(
        write(
            post(eventPath(w) + "/group-assignments"),
            w.owner,
            "{\"changes\":[" + groupChange(lead.id, g1) + "," + groupChange(mate.id, g1) + "]}"));
    ok(
        write(
            put(eventPath(w) + "/groups/" + g1 + "/leaders"),
            w.owner,
            "{\"participantIds\":[\"" + lead.id + "\"],\"expectedVersion\":0}"));
    ok(
        write(
            post(eventPath(w) + "/groups/publish"),
            w.owner,
            "{\"expectedBoardVersion\":"
                + board(w, "group-board").get("boardVersion").asLong()
                + "}"));

    long updates = updatesRooms(mate);
    String r1 = createRoom(w, "301호", "본관 3층", 6);
    assign(w, change(lead.id, null, r1), change(mate.id, null, r1));
    assertThat(myRooms(mate).get("status").asString()).isEqualTo("NOT_PUBLISHED");
    assertThat(myRooms(mate).get("myRoom").isNull()).isTrue();
    assertThat(updatesRooms(mate)).isEqualTo(updates);
    JsonNode leaderView = myGroup(lead).get("leaderView");
    assertThat(leaderView.get("members").get(1).get("room").isNull()).isTrue();
    assertThat(board(w).get("participants").get(0).get("publishedRoomId").isNull()).isTrue();
    assertThat(board(w).get("publication").get("hasUnpublishedChanges").asBoolean()).isTrue();

    JsonNode published = publish(w, true, false);
    assertThat(published.get("result").asString()).isEqualTo("PUBLISHED");
    assertThat(published.get("assignedCount").asLong()).isEqualTo(2);
    assertThat(published.get("changedParticipantCount").asLong()).isEqualTo(2);
    assertThat(updatesRooms(mate)).isEqualTo(updates + 1);
    JsonNode mine = myRooms(mate);
    assertThat(mine.get("status").asString()).isEqualTo("ASSIGNED");
    assertThat(mine.get("myRoom").get("name").asString()).isEqualTo("301호");
    JsonNode room = myGroup(lead).get("leaderView").get("members").get(1).get("room");
    assertThat(room.propertyNames()).containsExactly("name", "locationNote");
    assertThat(room.get("name").asString()).isEqualTo("301호");
    assertThat(room.get("locationNote").asString()).isEqualTo("본관 3층");
    JsonNode detail =
        json.readTree(ok(get("/api/v1/participant/group/members/" + mate.id).cookie(lead.session)));
    assertThat(detail.get("room").toString())
        .isEqualTo("{\"name\":\"301호\",\"locationNote\":\"본관 3층\"}");
    // A member who is not a leader still has no leader view.
    assertThat(myGroup(mate).get("leaderView").isNull()).isTrue();
    JsonNode summary = board(w).get("publication");
    assertThat(summary.get("hasUnpublishedChanges").asBoolean()).isFalse();
    assertThat(summary.get("lastPublishedByDisplayName").asString()).isEqualTo("Owner");

    int publications =
        count("SELECT count(*) FROM room_publications WHERE event_id = ?", w.eventId);
    int notifications = roomNotifications(w);
    int audits = auditCount(w, "ROOMS_PUBLISHED");
    JsonNode again = publish(w, false, false);
    assertThat(again.get("result").asString()).isEqualTo("ALREADY_PUBLISHED");
    assertThat(again.get("publicationId").asString())
        .isEqualTo(published.get("publicationId").asString());
    assertThat(again.get("changedParticipantCount").asLong()).isZero();
    assertThat(again.get("notifiedCount").asLong()).isZero();
    assertThat(count("SELECT count(*) FROM room_publications WHERE event_id = ?", w.eventId))
        .isEqualTo(publications);
    assertThat(roomNotifications(w)).isEqualTo(notifications);
    assertThat(auditCount(w, "ROOMS_PUBLISHED")).isEqualTo(audits);
    assertThat(updatesRooms(mate)).isEqualTo(updates + 1);

    // Moving away and back is no change (content comparison).
    String r2 = createRoom(w, "302호", null, null);
    assign(w, change(mate.id, r1, r2));
    assign(w, change(mate.id, r2, r1));
    ok(write(delete(roomsPath(w) + "/" + r2 + "?expectedVersion=0"), w.owner, null));
    assertThat(board(w).get("publication").get("hasUnpublishedChanges").asBoolean()).isFalse();
    assertThat(publish(w, false, false).get("result").asString()).isEqualTo("ALREADY_PUBLISHED");

    // The audit detail carries counts only.
    JsonNode audit =
        json.readTree(
            jdbc.queryForObject(
                "SELECT detail::text FROM audit_logs WHERE event_id = ? AND action = 'ROOMS_PUBLISHED'",
                String.class,
                w.eventId));
    assertThat(audit.propertyNames())
        .containsExactlyInAnyOrder(
            "publicationId",
            "boardVersion",
            "assignedCount",
            "unassignedCount",
            "changedParticipantCount",
            "roomsWithWarnings",
            "notify",
            "notifiedCount");
    assertThat(audit.toString()).doesNotContain("가조장").doesNotContain("나조원");
  }

  /** §15.3: two operators moving the same person: the later request stores nobody. */
  @Test
  void concurrentMovesOfTheSamePersonStoreNothing() throws Exception {
    World w = world();
    w.lodgingQuestions();
    Person a = w.participant("가람", "010-8100-0001", "90", FULL);
    Person b = w.participant("나래", "010-8100-0002", "91", FULL);
    Person c = w.participant("다솜", "010-8100-0003", "92", FULL);
    String r1 = createRoom(w, "301호", null, null);
    String r2 = createRoom(w, "302호", null, null);
    assign(w, change(a.id, null, r1));
    long version = board(w).get("boardVersion").asLong();

    // The first operator moved a to r2; the second still sees a in r1.
    assign(w, change(a.id, r1, r2));
    problem(
            assignRequest(w, change(b.id, null, r1), change(a.id, r1, null)),
            409,
            "CONCURRENT_MODIFICATION")
        .andExpect(jsonPath("$.conflicts[0].participantId").value(a.id.toString()))
        .andExpect(jsonPath("$.conflicts[0].currentRoomId").value(r2))
        .andExpect(jsonPath("$.boardVersion").value(version + 1));
    // Nobody of the rejected request was stored.
    assertThat(roomOf(w, b.id)).isNull();
    assertThat(roomOf(w, a.id)).isEqualTo(r2);
    assertThat(board(w).get("boardVersion").asLong()).isEqualTo(version + 1);

    // Different people: both stored.
    assign(w, change(b.id, null, r1));
    assign(w, change(c.id, null, r2));
    assertThat(roomOf(w, b.id)).isEqualTo(r1);
    assertThat(roomOf(w, c.id)).isEqualTo(r2);
    // Already at the destination counts as applied and moves nothing.
    JsonNode applied = json.readTree(ok(assignRequest(w, change(b.id, null, r1))));
    assertThat(applied.get("changed").asInt()).isZero();
    assertThat(applied.get("alreadyApplied").asInt()).isEqualTo(1);
    assertThat(applied.get("rooms")).isEmpty();

    // Form checks.
    problem(write(post(assignPath(w)), w.owner, "{\"changes\":[]}"), 400, "VALIDATION_FAILED")
        .andExpect(jsonPath("$.errors[0].field").value("changes"));
    problem(
        assignRequest(w, change(a.id, r2, null), change(a.id, r2, r1)), 400, "VALIDATION_FAILED");
    problem(
        write(
            post(assignPath(w)),
            w.owner,
            "{\"changes\":[{\"participantId\":\"" + a.id + "\",\"toRoomId\":null}]}"),
        400,
        "VALIDATION_FAILED");
    problem(
        write(
            post(assignPath(w)),
            w.owner,
            "{\"changes\":[{\"participantId\":\""
                + a.id
                + "\",\"fromRoomId\":\""
                + r2
                + "\",\"toRoomId\":null,\"night\":1}]}"),
        400,
        "VALIDATION_FAILED");
    problem(assignRequest(w, change(UUID.randomUUID(), null, r1)), 404, "RESOURCE_NOT_FOUND");
    problem(
        assignRequest(w, change(a.id, r2, UUID.randomUUID().toString())),
        404,
        "RESOURCE_NOT_FOUND");
    // History: one MOVE row per real move.
    assertThat(
            count(
                "SELECT count(*) FROM room_assignment_logs WHERE event_id = ? AND cause = 'MOVE'",
                w.eventId))
        .isEqualTo(4);
  }

  /**
   * §15.4: capacity and gender are warnings, not blocks; anyone who does not sleep over makes the
   * whole request 409 with nothing stored; taking them out is fine; UNKNOWN is never blocked.
   */
  @Test
  void capacityAndGenderWarnButNotLodgingIsRefused() throws Exception {
    World w = world();
    w.lodgingQuestions();
    UUID gender = w.preset("GENDER", "SINGLE_CHOICE", GENDER_OPTIONS);
    Person m1 = w.participant("가남", "010-8200-0001", "90", FULL);
    Person m2 = w.participant("나남", "010-8200-0002", "91", FULL);
    Person f1 = w.participant("다여", "010-8200-0003", "92", FULL);
    Person none = w.participant("라무", "010-8200-0004", "93", FULL);
    Person hidden = w.participant("마숨", "010-8200-0005", "94", FULL);
    Person home = w.participant("바집", "010-8200-0006", "95", WORSHIP);
    w.answer(m1.id, gender, "{\"optionId\":\"opt_male\"}");
    w.answer(m2.id, gender, "{\"optionId\":\"opt_male\"}");
    w.answer(f1.id, gender, "{\"optionId\":\"opt_female\"}");
    w.answer(hidden.id, gender, "{\"optionId\":\"opt_gone\"}");
    String r1 = createRoom(w, "301호", null, 2, "opt_male");

    JsonNode result =
        json.readTree(
            ok(
                assignRequest(
                    w,
                    change(m1.id, null, r1),
                    change(m2.id, null, r1),
                    change(f1.id, null, r1),
                    change(none.id, null, r1),
                    change(hidden.id, null, r1))));
    assertThat(result.get("changed").asInt()).isEqualTo(5);
    JsonNode state = result.get("rooms").get(0);
    assertThat(state.get("roomId").asString()).isEqualTo(r1);
    assertThat(state.get("memberCount").asLong()).isEqualTo(5);
    Map<String, JsonNode> warnings = warnings(state.get("warnings"));
    assertThat(warnings).containsOnlyKeys("OVER_CAPACITY", "GENDER_MISMATCH", "GENDER_UNKNOWN");
    assertThat(warnings.get("OVER_CAPACITY").toString())
        .isEqualTo("{\"code\":\"OVER_CAPACITY\",\"count\":5,\"capacity\":2}");
    assertThat(strings(warnings.get("GENDER_MISMATCH").get("participantIds")))
        .containsExactly(f1.id.toString());
    assertThat(strings(warnings.get("GENDER_UNKNOWN").get("participantIds")))
        .containsExactly(none.id.toString(), hidden.id.toString());
    assertThat(warnings(board(w).get("rooms").get(0).get("warnings"))).hasSize(3);

    // One person who does not sleep over refuses the whole request.
    long version = board(w).get("boardVersion").asLong();
    String r2 = createRoom(w, "302호", null, null);
    version++;
    problem(
            assignRequest(w, change(m1.id, r1, r2), change(home.id, null, r2)),
            409,
            "INVALID_STATE_TRANSITION")
        .andExpect(jsonPath("$.reason").value("NOT_LODGING"))
        .andExpect(jsonPath("$.participantIds[0]").value(home.id.toString()))
        .andExpect(jsonPath("$.participantIds.length()").value(1));
    assertThat(roomOf(w, m1.id)).isEqualTo(r1);
    assertThat(roomOf(w, home.id)).isNull();
    assertThat(board(w).get("boardVersion").asLong()).isEqualTo(version);
    // Taking someone out (here: someone already out) is fine.
    assertThat(
            json.readTree(ok(assignRequest(w, change(home.id, null, null))))
                .get("alreadyApplied")
                .asInt())
        .isEqualTo(1);

    // UNKNOWN (no lodging question at all) is never blocked.
    World plain = world();
    Person p1 = plain.participant("가람", "010-8200-0011", "90", null);
    Person p2 = plain.participant("나래", "010-8200-0012", "91", null);
    String room = createRoom(plain, "강당", null, null);
    assign(plain, change(p1.id, null, room), change(p2.id, null, room));
    JsonNode plainBoard = board(plain);
    for (JsonNode person : plainBoard.get("participants")) {
      assertThat(person.get("lodging").asString()).isEqualTo("UNKNOWN");
      assertThat(person.get("lodgingNights").isNull()).isTrue();
      assertThat(person.get("roomId").asString()).isEqualTo(room);
    }
    assertThat(plainBoard.get("publication").get("eligibleCount").asLong()).isEqualTo(2);
  }

  /**
   * §15.5: worship-only, NO_LODGING and same-day arrival and departure are NOT_LODGING, do not
   * count as unassigned, and cannot be put in a room; per-night counts match the application
   * summary.
   */
  @Test
  void lodgingFollowsTheSummaryRule() throws Exception {
    World w = world();
    w.lodgingQuestions();
    UUID noLodging = w.fieldIds.get("NO_LODGING");
    UUID lodging = w.fieldIds.get("LODGING");
    Person full = w.participant("가전체", "010-8300-0001", "90", FULL);
    Person worship = w.participant("나집회", "010-8300-0002", "91", WORSHIP);
    Person homeFull = w.participant("다집", "010-8300-0003", "92", FULL);
    w.answer(homeFull.id, noLodging, "{\"optionIds\":[\"opt_no_lodging\"]}");
    Person night1 = w.participant("라첫밤", "010-8300-0004", "93", PARTIAL);
    w.answer(night1.id, lodging, "{\"optionIds\":[\"opt_n1\"]}");
    Person noNight = w.participant("마안잠", "010-8300-0005", "94", PARTIAL);

    JsonNode board = board(w);
    assertThat(lodgingOf(board, full)).isEqualTo("LODGING");
    assertThat(nightsOf(board, full)).containsExactly(1, 2);
    assertThat(lodgingOf(board, worship)).isEqualTo("NOT_LODGING");
    assertThat(lodgingOf(board, homeFull)).isEqualTo("NOT_LODGING");
    assertThat(nightsOf(board, homeFull)).isEmpty();
    assertThat(lodgingOf(board, night1)).isEqualTo("LODGING");
    assertThat(nightsOf(board, night1)).containsExactly(1);
    assertThat(lodgingOf(board, noNight)).isEqualTo("NOT_LODGING");
    JsonNode publication = board.get("publication");
    assertThat(publication.get("activeCount").asLong()).isEqualTo(5);
    assertThat(publication.get("eligibleCount").asLong()).isEqualTo(2);
    assertThat(publication.get("unassignedCount").asLong()).isEqualTo(2);

    // The application summary counts the same nights.
    JsonNode summary =
        json.readTree(ok(get(eventPath(w) + "/applications/summary").cookie(w.owner)));
    Map<Integer, Long> fromBoard = new HashMap<>();
    for (JsonNode person : board.get("participants")) {
      for (JsonNode night : person.get("lodgingNights")) {
        fromBoard.merge(night.asInt(), 1L, Long::sum);
      }
    }
    JsonNode nights = summary.get("lodging").get("nights");
    assertThat(nights).hasSize(2);
    for (JsonNode night : nights) {
      assertThat(night.get("count").asLong())
          .isEqualTo(fromBoard.getOrDefault(night.get("night").asInt(), 0L));
    }

    String r1 = createRoom(w, "301호", null, null);
    for (Person person : List.of(worship, homeFull, noNight)) {
      problem(assignRequest(w, change(person.id, null, r1)), 409, "INVALID_STATE_TRANSITION")
          .andExpect(jsonPath("$.reason").value("NOT_LODGING"));
    }
    // Publishing with the two lodgers unassigned needs confirmUnassigned (2), not the others.
    problem(publishRequest(w, false, false, true), 409, "CONFIRMATION_REQUIRED")
        .andExpect(jsonPath("$.unassignedCount").value(2))
        .andExpect(jsonPath("$.notLodgingAssignedCount").value(0));

    // A RANGE-mode partial attendee who arrives and leaves the same day sleeps no night.
    World range = world();
    range.rangeSetup();
    Person sameDay = range.participant("바당일", "010-8300-0011", "95", PARTIAL);
    range.answer(
        sameDay.id, range.fieldIds.get("ARRIVAL_SLOT"), "{\"optionId\":\"opt_d1_dinner\"}");
    range.answer(
        sameDay.id, range.fieldIds.get("DEPARTURE_SLOT"), "{\"optionId\":\"opt_d1_worship\"}");
    Person overnight = range.participant("사숙박", "010-8300-0012", "96", PARTIAL);
    range.answer(
        overnight.id, range.fieldIds.get("ARRIVAL_SLOT"), "{\"optionId\":\"opt_d1_dinner\"}");
    range.answer(
        overnight.id, range.fieldIds.get("DEPARTURE_SLOT"), "{\"optionId\":\"opt_d2_lunch\"}");
    JsonNode rangeBoard = board(range);
    assertThat(lodgingOf(rangeBoard, sameDay)).isEqualTo("NOT_LODGING");
    assertThat(nightsOf(rangeBoard, overnight)).containsExactly(1);
    String room = createRoom(range, "301호", null, null);
    problem(assignRequest(range, change(sameDay.id, null, room)), 409, "INVALID_STATE_TRANSITION")
        .andExpect(jsonPath("$.reason").value("NOT_LODGING"));
  }

  /**
   * §15.6: someone who drops lodging after being assigned stays in the room with a NOT_LODGING
   * warning and a NOT_LODGING "다시 볼 것" mark (A11), publishing needs {@code confirmNotLodging}, they
   * are on the published room list, and they cannot move to another room. The assignment basis is
   * stored for A11.
   */
  @Test
  void droppingLodgingAfterAssignmentKeepsTheRoomAndNeedsConfirmation() throws Exception {
    World w = world();
    w.lodgingQuestions();
    Person stay = w.participant("가남음", "010-8400-0001", "90", FULL);
    Person quit = w.participant("나뺌", "010-8400-0002", "91", FULL);
    String r1 = createRoom(w, "301호", null, null);
    String r2 = createRoom(w, "302호", null, null);
    assign(w, change(stay.id, null, r1), change(quit.id, null, r1));
    JsonNode basis =
        json.readTree(
            jdbc.queryForObject(
                "SELECT basis::text FROM room_assignments WHERE participant_id = ?",
                String.class,
                quit.id));
    assertThat(basis.propertyNames())
        .containsExactlyInAnyOrder("genderOptionId", "lodgingNights", "slotIds");
    assertThat(basis.get("lodgingNights").toString()).isEqualTo("[1,2]");

    w.answer(quit.id, w.fieldIds.get("NO_LODGING"), "{\"optionIds\":[\"opt_no_lodging\"]}");
    JsonNode board = board(w);
    assertThat(lodgingOf(board, quit)).isEqualTo("NOT_LODGING");
    assertThat(person(board, quit).get("roomId").asString()).isEqualTo(r1);
    assertThat(strings(person(board, quit).get("review").get("reasons")))
        .containsExactly("NOT_LODGING");
    assertThat(person(board, stay).get("review").isNull()).isTrue();
    assertThat(
            strings(
                warnings(board.get("rooms").get(0).get("warnings"))
                    .get("NOT_LODGING")
                    .get("participantIds")))
        .containsExactly(quit.id.toString());
    assertThat(board.get("publication").get("notLodgingAssignedCount").asLong()).isEqualTo(1);
    assertThat(board.get("publication").get("unassignedCount").asLong()).isZero();

    problem(publishRequest(w, false, false, true), 409, "CONFIRMATION_REQUIRED")
        .andExpect(jsonPath("$.unassignedCount").value(0))
        .andExpect(jsonPath("$.notLodgingAssignedCount").value(1));
    problem(assignRequest(w, change(quit.id, r1, r2)), 409, "INVALID_STATE_TRANSITION")
        .andExpect(jsonPath("$.reason").value("NOT_LODGING"));
    JsonNode published = publish(w, false, true);
    assertThat(published.get("notLodgingAssignedCount").asLong()).isEqualTo(1);
    assertThat(published.get("roomsWithWarnings").asLong()).isEqualTo(1);
    JsonNode roomList = json.readTree(ok(get(roomsPath(w) + "/published").cookie(w.owner)));
    assertThat(names(roomList.get("rooms").get(0).get("members"))).containsExactly("가남음", "나뺌");
    JsonNode mine = myRooms(quit);
    assertThat(mine.get("status").asString()).isEqualTo("ASSIGNED");
    assertThat(mine.get("notLodging").asBoolean()).isTrue();
    assertThat(myRooms(stay).get("notLodging").asBoolean()).isFalse();

    // Taking them out is allowed; then they are neither unassigned nor confirmed again.
    assign(w, change(quit.id, r1, null));
    JsonNode after = board(w).get("publication");
    assertThat(after.get("notLodgingAssignedCount").asLong()).isZero();
    assertThat(after.get("unassignedCount").asLong()).isZero();
    assertThat(publish(w, false, false).get("result").asString()).isEqualTo("PUBLISHED");
    JsonNode out = myRooms(quit);
    assertThat(out.get("status").asString()).isEqualTo("UNASSIGNED");
    assertThat(out.get("notLodging").asBoolean()).isTrue();
  }

  /**
   * A11 (#461, DEC-085 §8): after an application edit, the board marks assigned people whose basis
   * (lodging nights, 참석 칸, shown gender) differs, with the reasons; an edit of any other answer
   * adds no mark. "확인" stamps the current values without moving anyone, writing history or moving
   * {@code boardVersion}; a repeat is {@code unchanged}. Someone who dropped lodging loses the mark
   * on 확인 but keeps the room warning and the publish confirmation. Moving someone restamps too.
   */
  @Test
  void reviewMarksFollowTheBasisAndClearOnConfirm() throws Exception {
    World w = world();
    w.lodgingQuestions();
    UUID gender = w.preset("GENDER", "SINGLE_CHOICE", GENDER_OPTIONS);
    UUID cell = w.custom("셀", "SHORT_TEXT", "{}");
    Person nights = w.participant("가밤", "010-8450-0001", "90", FULL);
    Person quits = w.participant("나뺌", "010-8450-0002", "91", FULL);
    Person turns = w.participant("다성별", "010-8450-0003", "92", FULL);
    Person other = w.participant("라셀", "010-8450-0004", "93", FULL);
    Person moved = w.participant("마옮김", "010-8450-0005", "94", FULL);
    Person waiting = w.participant("바대기", "010-8450-0006", "95", FULL);
    for (Person p : List.of(nights, quits, turns, other, moved, waiting)) {
      w.answer(p.id, gender, "{\"optionId\":\"opt_male\"}");
    }
    w.answer(other.id, cell, "{\"text\":\"다윗셀\"}");
    String r1 = createRoom(w, "301호", null, null, "opt_male");
    String r2 = createRoom(w, "302호", null, null);
    assign(
        w,
        change(nights.id, null, r1),
        change(quits.id, null, r1),
        change(turns.id, null, r1),
        change(other.id, null, r1),
        change(moved.id, null, r1));
    JsonNode before = board(w);
    for (JsonNode person : before.get("participants")) {
      assertThat(person.get("review").isNull()).isTrue();
    }

    // A4 edits: other nights, no lodging, another gender, and an answer outside the basis.
    w.reanswer(nights.id, w.fieldIds.get("ATTENDANCE"), PARTIAL);
    w.answer(nights.id, w.fieldIds.get("LODGING"), "{\"optionIds\":[\"opt_n1\"]}");
    w.answer(quits.id, w.fieldIds.get("NO_LODGING"), "{\"optionIds\":[\"opt_no_lodging\"]}");
    w.reanswer(turns.id, gender, "{\"optionId\":\"opt_female\"}");
    w.reanswer(other.id, cell, "{\"text\":\"요셉셀\"}");
    w.reanswer(moved.id, gender, "{\"optionId\":\"opt_gone\"}");
    w.reanswer(waiting.id, gender, "{\"optionId\":\"opt_female\"}");

    JsonNode board = board(w);
    long version = board.get("boardVersion").asLong();
    JsonNode nightsReview = person(board, nights).get("review");
    assertThat(strings(nightsReview.get("reasons"))).containsExactly("LODGING_CHANGED");
    assertThat(nightsReview.get("assignedAt").isString()).isTrue();
    assertThat(strings(person(board, quits).get("review").get("reasons")))
        .containsExactly("NOT_LODGING");
    assertThat(strings(person(board, turns).get("review").get("reasons")))
        .containsExactly("GENDER_CHANGED");
    // A shown option replaced by a hidden one is "no gender" now: also a change.
    assertThat(strings(person(board, moved).get("review").get("reasons")))
        .containsExactly("GENDER_CHANGED");
    assertThat(person(board, other).get("review").isNull()).isTrue();
    assertThat(person(board, waiting).get("review").isNull()).isTrue();
    assertThat(board.get("review")).isNull();

    // Moving restamps: the mark clears and the room changes as usual.
    assign(w, change(moved.id, r1, r2));
    assertThat(person(board(w), moved).get("review").isNull()).isTrue();
    version++;

    int logs = count("SELECT count(*) FROM room_assignment_logs WHERE event_id = ?", w.eventId);
    JsonNode confirmed =
        json.readTree(
            ok(
                reviewRequest(
                    w,
                    ids(
                        "participantIds",
                        nights.id.toString(),
                        quits.id.toString(),
                        other.id.toString(),
                        waiting.id.toString()))));
    assertThat(confirmed.get("confirmed").asInt()).isEqualTo(2);
    assertThat(confirmed.get("unchanged").asInt()).isEqualTo(1);
    assertThat(confirmed.get("notAssigned").asInt()).isEqualTo(1);
    assertThat(confirmed.get("boardVersion").asLong()).isEqualTo(version);
    JsonNode after = board(w);
    assertThat(after.get("boardVersion").asLong()).isEqualTo(version);
    assertThat(person(after, nights).get("review").isNull()).isTrue();
    assertThat(person(after, nights).get("roomId").asString()).isEqualTo(r1);
    assertThat(person(after, quits).get("review").isNull()).isTrue();
    assertThat(strings(person(after, turns).get("review").get("reasons")))
        .containsExactly("GENDER_CHANGED");
    assertThat(count("SELECT count(*) FROM room_assignment_logs WHERE event_id = ?", w.eventId))
        .isEqualTo(logs);
    JsonNode basis =
        json.readTree(
            jdbc.queryForObject(
                "SELECT basis::text FROM room_assignments WHERE participant_id = ?",
                String.class,
                nights.id));
    assertThat(basis.get("lodgingNights").toString()).isEqualTo("[1]");
    // Confirming does not hide that someone who does not sleep over is still in a room.
    Map<String, JsonNode> roomWarnings = warnings(after.get("rooms").get(0).get("warnings"));
    assertThat(strings(roomWarnings.get("NOT_LODGING").get("participantIds")))
        .containsExactly(quits.id.toString());
    assertThat(strings(roomWarnings.get("GENDER_MISMATCH").get("participantIds")))
        .containsExactly(turns.id.toString());
    assertThat(after.get("publication").get("notLodgingAssignedCount").asLong()).isEqualTo(1);
    problem(publishRequest(w, true, false, true), 409, "CONFIRMATION_REQUIRED")
        .andExpect(jsonPath("$.notLodgingAssignedCount").value(1));

    // Sending the same confirmation again changes nothing.
    JsonNode again =
        json.readTree(ok(reviewRequest(w, ids("participantIds", nights.id.toString()))));
    assertThat(again.get("confirmed").asInt()).isZero();
    assertThat(again.get("unchanged").asInt()).isEqualTo(1);

    // Form, unknown participant, permission and event state.
    problem(reviewRequest(w, "{\"participantIds\":[]}"), 400, "VALIDATION_FAILED")
        .andExpect(jsonPath("$.errors[0].field").value("participantIds"));
    problem(
            reviewRequest(w, ids("participantIds", turns.id.toString(), turns.id.toString())),
            400,
            "VALIDATION_FAILED")
        .andExpect(jsonPath("$.errors[0].field").value("participantIds"));
    problem(
        reviewRequest(w, ids("participantIds", UUID.randomUUID().toString())),
        404,
        "RESOURCE_NOT_FOUND");
    Cookie staff = login(w.operator("Staff", "STAFF"));
    problem(
        write(post(assignPath(w) + "/review"), staff, ids("participantIds", turns.id.toString())),
        403,
        "FORBIDDEN");
    lifecycle(w.eventId, "ENDED");
    problem(reviewRequest(w, ids("participantIds", turns.id.toString())), 409, "EVENT_ENDED");
    lifecycle(w.eventId, "ACTIVE");

    // Participants never see the marks.
    publish(w, true, true);
    assertThat(json.writeValueAsString(myRooms(turns))).doesNotContain("review");
  }

  /**
   * §15.7: a withdraw removes the assignment with a WITHDRAWN history row in the same transaction;
   * the person drops out of every list, and restoring does not bring the old room back.
   */
  @Test
  void withdrawnPeopleLeaveTheirRoom() throws Exception {
    World w = world();
    w.lodgingQuestions();
    Person stay = w.participant("가남음", "010-8500-0001", "90", FULL);
    Person quit = w.participant("나취소", "010-8500-0002", "91", FULL);
    String r1 = createRoom(w, "301호", null, 1);
    assign(w, change(stay.id, null, r1), change(quit.id, null, r1));
    publish(w, false, false);
    assertThat(names(myRooms(stay).get("myRoom").get("members"))).containsExactly("가남음", "나취소");
    long version = board(w).get("boardVersion").asLong();
    long updates = updatesRooms(stay);

    ok(
        write(
            post(eventPath(w) + "/applications/" + w.applications.get(quit.id) + "/withdraw"),
            w.owner,
            "{}"));
    assertThat(roomOf(w, quit.id)).isNull();
    assertThat(
            count(
                "SELECT count(*) FROM room_assignment_logs WHERE participant_id = ?"
                    + " AND cause = 'WITHDRAWN' AND from_room_id = ? AND to_room_id IS NULL",
                quit.id,
                UUID.fromString(r1)))
        .isEqualTo(1);
    JsonNode board = board(w);
    assertThat(board.get("boardVersion").asLong()).isEqualTo(version + 1);
    assertThat(names(board.get("participants"))).containsExactly("가남음");
    assertThat(board.get("withdrawn")).isEmpty();
    assertThat(board.get("rooms").get(0).get("memberCount").asLong()).isEqualTo(1);
    assertThat(board.get("rooms").get(0).get("warnings")).isEmpty();
    assertThat(updatesRooms(stay)).isEqualTo(updates + 1);
    JsonNode mine = myRooms(stay);
    assertThat(names(mine.get("myRoom").get("members"))).containsExactly("가남음");
    assertThat(names(mine.get("rooms").get(0).get("members"))).containsExactly("가남음");
    JsonNode published = json.readTree(ok(get(roomsPath(w) + "/published").cookie(w.owner)));
    assertThat(names(published.get("rooms").get(0).get("members"))).containsExactly("가남음");
    assertThat(published.get("unassigned")).isEmpty();
    // The withdraw ended the person's sessions (DEC-084 §4), so the read is 401 before
    // NOT_ELIGIBLE.
    problem(get(MY_ROOMS).cookie(quit.session), 401, "AUTHENTICATION_REQUIRED");
    // Any session counts only while the application is SUBMITTED, so NOT_ELIGIBLE is not reached
    // over HTTP for a withdrawn person (the same as the group read).
    Person flipped = w.participant("다상태", "010-8500-0003", "92", FULL);
    jdbc.update(
        "UPDATE applications SET status = 'WITHDRAWN' WHERE participant_id = ?", flipped.id);
    problem(get(MY_ROOMS).cookie(flipped.session), 401, "AUTHENTICATION_REQUIRED");

    // Restore: no room comes back, from the working copy or the old publication.
    ok(
        write(
            post(eventPath(w) + "/applications/" + w.applications.get(quit.id) + "/restore"),
            w.owner,
            "{}"));
    assertThat(roomOf(w, quit.id)).isNull();
    Cookie again = ParticipantSessions.open(jdbc, w.spaceId, w.eventId, quit.id);
    assertThat(json.readTree(ok(get(MY_ROOMS).cookie(again))).get("status").asString())
        .isEqualTo("UNASSIGNED");
  }

  /** §15.8: what participants get of other people, exactly. */
  @Test
  void participantResponsesCarryOnlyNamesCohortsAndGenders() throws Exception {
    World w = world();
    w.lodgingQuestions();
    UUID gender = w.preset("GENDER", "SINGLE_CHOICE", GENDER_OPTIONS);
    UUID secret = w.custom("비밀 답", "SHORT_TEXT", "{}");
    Person me = w.participant("가나", "010-8600-0001", "90", FULL);
    Person mate = w.participant("나룸", "010-8600-0002", "91", FULL);
    Person other = w.participant("다옆방", "010-8600-0003", "92", FULL);
    Person outside = w.participant("라미배정", "010-8600-0004", "93", FULL);
    w.answer(me.id, gender, "{\"optionId\":\"opt_male\"}");
    w.answer(mate.id, gender, "{\"optionId\":\"opt_gone\"}");
    w.answer(mate.id, secret, "{\"text\":\"비밀값-123\"}");
    w.answer(other.id, secret, "{\"text\":\"비밀값-456\"}");
    jdbc.update(
        """
        INSERT INTO application_operations (
          application_id, space_id, event_id, memo, version, updated_by, updated_at)
        VALUES (?, ?, ?, '운영메모', 1, ?, now())
        """,
        w.applications.get(mate.id),
        w.spaceId,
        w.eventId,
        w.ownerId);
    String r1 = createRoom(w, "301호", "본관 3층", 4, "opt_male");
    String r2 = createRoom(w, "302호", null, null);
    String r3 = createRoom(w, "303호", null, null);
    assign(w, change(me.id, null, r1), change(mate.id, null, r1), change(other.id, null, r2));
    publish(w, true, false);

    String body =
        mvc.perform(get(MY_ROOMS).cookie(me.session))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store"))
            .andReturn()
            .getResponse()
            .getContentAsString();
    JsonNode mine = json.readTree(body);
    assertThat(mine.propertyNames())
        .containsExactly("status", "publishedAt", "rosterScope", "notLodging", "myRoom", "rooms");
    assertThat(mine.get("rosterScope").asString()).isEqualTo("ALL");
    JsonNode myRoom = mine.get("myRoom");
    assertThat(myRoom.propertyNames())
        .containsExactly("roomId", "name", "locationNote", "genderLabel", "members");
    assertThat(myRoom.get("roomId").asString()).isEqualTo(r1);
    assertThat(myRoom.get("genderLabel").asString()).isEqualTo("남");
    for (JsonNode member : myRoom.get("members")) {
      assertThat(member.propertyNames()).containsExactly("name", "cohort", "gender", "me");
    }
    assertThat(myRoom.get("members").get(0).get("me").asBoolean()).isTrue();
    assertThat(myRoom.get("members").get(0).get("gender").asString()).isEqualTo("남");
    // A hidden option reads as no gender.
    assertThat(myRoom.get("members").get(1).get("gender").isNull()).isTrue();
    JsonNode rooms = mine.get("rooms");
    assertThat(rooms).hasSize(3);
    assertThat(rooms.get(2).get("roomId").asString()).isEqualTo(r3);
    assertThat(rooms.get(2).get("members")).isEmpty();
    for (JsonNode room : rooms) {
      assertThat(room.propertyNames())
          .containsExactly("roomId", "name", "locationNote", "genderLabel", "members");
      for (JsonNode member : room.get("members")) {
        assertThat(member.propertyNames()).containsExactly("name", "cohort");
      }
    }
    assertThat(body)
        .doesNotContain(mate.id.toString())
        .doesNotContain(other.id.toString())
        .doesNotContain(outside.id.toString())
        .doesNotContain(me.id.toString())
        .doesNotContain("participantId")
        .doesNotContain("010-")
        .doesNotContain("비밀값")
        .doesNotContain("운영메모")
        .doesNotContain("lodgingNights")
        .doesNotContain("slotIds")
        .doesNotContain("capacity")
        .doesNotContain("라미배정")
        .doesNotContain("review");

    // Notification texts carry the reader's own room only.
    for (Map<String, Object> row :
        jdbc.queryForList(
            "SELECT title, body FROM notifications WHERE event_id = ? AND kind = 'ROOM_PUBLISHED'",
            w.eventId)) {
      String text = row.get("title") + " " + row.get("body");
      for (String name : List.of("가나", "나룸", "다옆방", "라미배정")) {
        assertThat(text).doesNotContain(name);
      }
    }
  }

  /** §15.9: the scope switch narrows what participants see; leaders see rooms whatever it is. */
  @Test
  void rosterScopeNarrowsTheParticipantViewOnly() throws Exception {
    World w = world();
    w.lodgingQuestions();
    Person lead = w.participant("가조장", "010-8700-0001", "90", FULL);
    Person mate = w.participant("나조원", "010-8700-0002", "91", FULL);
    String g1 = createGroup(w, "1조");
    ok(
        write(
            post(eventPath(w) + "/group-assignments"),
            w.owner,
            "{\"changes\":[" + groupChange(lead.id, g1) + "," + groupChange(mate.id, g1) + "]}"));
    ok(
        write(
            put(eventPath(w) + "/groups/" + g1 + "/leaders"),
            w.owner,
            "{\"participantIds\":[\"" + lead.id + "\"],\"expectedVersion\":0}"));
    ok(
        write(
            post(eventPath(w) + "/groups/publish"),
            w.owner,
            "{\"expectedBoardVersion\":"
                + board(w, "group-board").get("boardVersion").asLong()
                + "}"));
    String r1 = createRoom(w, "301호", "본관", null);
    assign(w, change(lead.id, null, r1), change(mate.id, null, r1));

    // Before a publication the switch changes no participant value.
    long before = updatesRooms(mate);
    JsonNode settings = json.readTree(ok(putScope(w, "ROOMMATES", 0)));
    assertThat(settings.get("roomRosterScope").asString()).isEqualTo("ROOMMATES");
    assertThat(settings.get("groupRosterVisibleToMembers").asBoolean()).isTrue();
    assertThat(updatesRooms(mate)).isEqualTo(before);
    publish(w, false, false);
    long published = updatesRooms(mate);
    assertThat(published).isEqualTo(before + 1);

    JsonNode roommates = myRooms(mate);
    assertThat(roommates.get("rosterScope").asString()).isEqualTo("ROOMMATES");
    assertThat(roommates.get("rooms").isNull()).isTrue();
    assertThat(names(roommates.get("myRoom").get("members"))).containsExactly("가조장", "나조원");

    long groupValue = updatesGroup(mate);
    ok(putScope(w, "MY_ROOM", 1));
    assertThat(updatesRooms(mate)).isEqualTo(published + 1);
    assertThat(updatesGroup(mate)).isEqualTo(groupValue);
    JsonNode myRoomOnly = myRooms(mate);
    assertThat(myRoomOnly.get("rooms").isNull()).isTrue();
    assertThat(myRoomOnly.get("myRoom").get("members").isNull()).isTrue();
    assertThat(myRoomOnly.get("myRoom").get("name").asString()).isEqualTo("301호");
    assertThat(
            myGroup(lead)
                .get("leaderView")
                .get("members")
                .get(1)
                .get("room")
                .get("name")
                .asString())
        .isEqualTo("301호");
    JsonNode audit =
        json.readTree(
            jdbc.queryForObject(
                "SELECT detail::text FROM audit_logs WHERE event_id = ?"
                    + " AND action = 'EVENT_PARTICIPANT_SETTINGS_UPDATED' ORDER BY occurred_at DESC"
                    + " LIMIT 1",
                String.class,
                w.eventId));
    assertThat(strings(audit.get("fields"))).containsExactly("roomRosterScope");

    // The same value stores nothing; another value is 400.
    assertThat(json.readTree(ok(putScope(w, "MY_ROOM", 2))).get("version").asInt()).isEqualTo(2);
    assertThat(updatesRooms(mate)).isEqualTo(published + 1);
    problem(putScope(w, "EVERYONE", 2), 400, "VALIDATION_FAILED")
        .andExpect(jsonPath("$.errors[0].field").value("roomRosterScope"));
    ok(putScope(w, "ALL", 2));
    assertThat(myRooms(mate).get("rooms")).hasSize(1);
  }

  /** §15.10, §15.14: who reads and writes the board; an operator cookie does not open rooms. */
  @Test
  void permissionsFollowRoomWrite() throws Exception {
    World w = world();
    w.lodgingQuestions();
    Person p = w.participant("가람", "010-8800-0001", "90", FULL);
    String g1 = createGroup(w, "1조");
    ok(
        write(
            post(eventPath(w) + "/group-assignments"),
            w.owner,
            "{\"changes\":[" + groupChange(p.id, g1) + "]}"));
    String r1 = createRoom(w, "301호", null, null);

    // The owner has GROUP_WRITE and sees the draft group.
    assertThat(person(board(w), p).get("draftGroupId").asString()).isEqualTo(g1);

    UUID staff = w.operator("Staff", "STAFF");
    Cookie staffCookie = login(staff);
    problem(get(eventPath(w) + "/room-board").cookie(staffCookie), 403, "FORBIDDEN");
    problem(assignRequestAs(staffCookie, w, change(p.id, null, r1)), 403, "FORBIDDEN");
    // EVENT_READ opens the published view.
    assertThat(
            json.readTree(ok(get(roomsPath(w) + "/published").cookie(staffCookie)))
                .get("publishedAt")
                .isNull())
        .isTrue();
    // A personal ROOM_WRITE grant without GROUP_WRITE: the board, but no draft group.
    jdbc.update(
        """
        INSERT INTO event_user_permissions (
          space_id, event_id, user_id, permission, effect, granted_by, granted_at)
        VALUES (?, ?, ?, 'ROOM_WRITE', 'GRANT', ?, now())
        """,
        w.spaceId,
        w.eventId,
        staff,
        w.ownerId);
    JsonNode staffBoard = json.readTree(ok(get(eventPath(w) + "/room-board").cookie(staffCookie)));
    for (JsonNode person : staffBoard.get("participants")) {
      assertThat(person.get("draftGroupId").isNull()).isTrue();
    }
    ok(assignRequestAs(staffCookie, w, change(p.id, null, r1)));

    // A space admin without an event role reads but does not write.
    UUID admin = user("Admin");
    member(w.spaceId, admin, "ADMIN");
    Cookie adminCookie = login(admin);
    ok(get(eventPath(w) + "/room-board").cookie(adminCookie));
    problem(write(post(roomsPath(w)), adminCookie, "{\"name\":\"302호\"}"), 403, "FORBIDDEN");
    UUID stranger = user("Stranger");
    problem(get(eventPath(w) + "/room-board").cookie(login(stranger)), 404, "RESOURCE_NOT_FOUND");

    // §15.14: the operator session is not a participant session.
    problem(get(MY_ROOMS).cookie(w.owner), 401, "AUTHENTICATION_REQUIRED");
    problem(get(MY_ROOMS), 401, "AUTHENTICATION_REQUIRED");
  }

  /** §15.11: ENDED and ARCHIVED refuse writes; participants keep the last publication. */
  @Test
  void endedAndArchivedEventsRefuseWrites() throws Exception {
    World w = world();
    w.lodgingQuestions();
    Person p = w.participant("가람", "010-8900-0001", "90", FULL);
    String r1 = createRoom(w, "301호", null, null);
    assign(w, change(p.id, null, r1));
    publish(w, false, false);
    long version = board(w).get("boardVersion").asLong();

    lifecycle(w.eventId, "ENDED");
    problem(write(post(roomsPath(w)), w.owner, "{\"name\":\"302호\"}"), 409, "EVENT_ENDED");
    problem(assignRequest(w, change(p.id, r1, null)), 409, "EVENT_ENDED");
    problem(publishRequest(w, true, true, true), 409, "EVENT_ENDED");
    assertThat(myRooms(p).get("myRoom").get("name").asString()).isEqualTo("301호");
    lifecycle(w.eventId, "ARCHIVED");
    problem(
        write(delete(roomsPath(w) + "/" + r1 + "?expectedVersion=0"), w.owner, null),
        409,
        "EVENT_ARCHIVED");
    problem(
        write(put(roomsPath(w) + "/order"), w.owner, ids("roomIds", r1)), 409, "EVENT_ARCHIVED");
    assertThat(board(w).get("eventStatus").asString()).isEqualTo("ARCHIVED");
    assertThat(board(w).get("boardVersion").asLong()).isEqualTo(version);
    assertThat(myRooms(p).get("status").asString()).isEqualTo("ASSIGNED");
  }

  /** §15.12: deleting a room unassigns its people with a history row each until republished. */
  @Test
  void deletingARoomUnassignsItsPeopleButNotThePublication() throws Exception {
    World w = world();
    w.lodgingQuestions();
    Person a = w.participant("가람", "010-9000-0001", "90", FULL);
    Person b = w.participant("나래", "010-9000-0002", "91", FULL);
    String r1 = createRoom(w, "301호", null, null);
    assign(w, change(a.id, null, r1), change(b.id, null, r1));
    publish(w, false, false);
    long updates = updatesRooms(a);

    JsonNode deleted =
        json.readTree(
            ok(write(delete(roomsPath(w) + "/" + r1 + "?expectedVersion=0"), w.owner, null)));
    assertThat(deleted.get("unassignedCount").asInt()).isEqualTo(2);
    assertThat(
            count(
                "SELECT count(*) FROM room_assignment_logs WHERE event_id = ?"
                    + " AND cause = 'ROOM_DELETED' AND from_room_id = ?",
                w.eventId,
                UUID.fromString(r1)))
        .isEqualTo(2);
    assertThat(roomOf(w, a.id)).isNull();
    assertThat(myRooms(a).get("myRoom").get("name").asString()).isEqualTo("301호");
    assertThat(updatesRooms(a)).isEqualTo(updates);
    JsonNode summary = board(w).get("publication");
    assertThat(summary.get("roomChanges").asLong()).isEqualTo(1);
    assertThat(summary.get("changedParticipantCount").asLong()).isEqualTo(2);

    publish(w, true, false);
    assertThat(myRooms(a).get("status").asString()).isEqualTo("UNASSIGNED");
    assertThat(myRooms(a).get("rooms")).isEmpty();
  }

  /**
   * §15.13: the first publication tells everyone with a room; later ones only people whose room
   * changed and people whose room was renamed or moved; {@code notify: false} tells nobody.
   */
  @Test
  void publicationsNotifyOnlyPeopleWhoseRoomChanged() throws Exception {
    World w = world();
    w.lodgingQuestions();
    Person a = w.participant("가람", "010-9100-0001", "90", FULL);
    Person b = w.participant("나래", "010-9100-0002", "91", FULL);
    Person c = w.participant("다솜", "010-9100-0003", "92", FULL);
    Person d = w.participant("라온", "010-9100-0004", "93", FULL);
    String r1 = createRoom(w, "301호", "본관 3층", null);
    String r2 = createRoom(w, "302호", null, null);
    assign(w, change(a.id, null, r1), change(b.id, null, r1), change(c.id, null, r2));

    JsonNode first = publish(w, true, false);
    assertThat(first.get("notifiedCount").asLong()).isEqualTo(3);
    assertThat(notificationsOf(a)).containsExactly("숙소가 정해졌어요|301호 · 본관 3층|" + r1);
    assertThat(notificationsOf(c)).containsExactly("숙소가 정해졌어요|302호|" + r2);
    assertThat(notificationsOf(d)).isEmpty();
    markAllRead(w);

    // b moves to r2, c is taken out, d comes into r2, r1 is renamed; a only sees the rename.
    assign(w, change(b.id, r1, r2), change(c.id, r2, null), change(d.id, null, r2));
    ok(
        write(
            patch(roomsPath(w) + "/" + r1), w.owner, "{\"name\":\"301A호\",\"expectedVersion\":0}"));
    JsonNode second = publish(w, true, false);
    assertThat(second.get("notifiedCount").asLong()).isEqualTo(4);
    assertThat(notificationsOf(a)).containsExactly("숙소 정보가 바뀌었어요|301A호 · 본관 3층|" + r1);
    assertThat(notificationsOf(b)).containsExactly("숙소가 바뀌었어요|302호|" + r2);
    assertThat(notificationsOf(c)).containsExactly("숙소 배정이 바뀌었어요|숙소 화면에서 확인해 주세요|null");
    assertThat(notificationsOf(d)).containsExactly("숙소가 바뀌었어요|302호|" + r2);
    markAllRead(w);

    // A capacity change alone notifies nobody; notify false notifies nobody at all.
    ok(write(patch(roomsPath(w) + "/" + r2), w.owner, "{\"capacity\":9,\"expectedVersion\":0}"));
    assertThat(publish(w, true, false).get("notifiedCount").asLong()).isZero();
    assign(w, change(a.id, r1, r2));
    JsonNode silent = publishRequestBody(w, true, false, false);
    assertThat(silent.get("result").asString()).isEqualTo("PUBLISHED");
    assertThat(silent.get("notifiedCount").asLong()).isZero();
    assertThat(unread(w)).isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT detail ->> 'notify' FROM audit_logs WHERE event_id = ?"
                    + " AND action = 'ROOMS_PUBLISHED' ORDER BY occurred_at DESC LIMIT 1",
                String.class,
                w.eventId))
        .isEqualTo("false");
  }

  // ---- requests ----

  private JsonNode board(World w) throws Exception {
    return board(w, "room-board");
  }

  private JsonNode board(World w, String path) throws Exception {
    return json.readTree(ok(get(eventPath(w) + "/" + path).cookie(w.owner)));
  }

  private JsonNode myRooms(Person p) throws Exception {
    return json.readTree(ok(get(MY_ROOMS).cookie(p.session)));
  }

  private JsonNode myGroup(Person p) throws Exception {
    return json.readTree(ok(get("/api/v1/participant/group").cookie(p.session)));
  }

  private long updatesRooms(Person p) throws Exception {
    return json.readTree(ok(get("/api/v1/participant/updates").cookie(p.session)))
        .get("rooms")
        .asLong();
  }

  private long updatesGroup(Person p) throws Exception {
    return json.readTree(ok(get("/api/v1/participant/updates").cookie(p.session)))
        .get("group")
        .asLong();
  }

  private String createRoom(World w, String name, String note, Integer capacity) throws Exception {
    return createRoom(w, name, note, capacity, null);
  }

  private String createRoom(World w, String name, String note, Integer capacity, String gender)
      throws Exception {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("name", name);
    body.put("locationNote", note);
    body.put("capacity", capacity);
    body.put("genderOptionId", gender);
    return json.readTree(created(write(post(roomsPath(w)), w.owner, json.writeValueAsString(body))))
        .get("room")
        .get("roomId")
        .asString();
  }

  private String createGroup(World w, String name) throws Exception {
    return json.readTree(
            created(write(post(eventPath(w) + "/groups"), w.owner, "{\"name\":\"" + name + "\"}")))
        .get("group")
        .get("groupId")
        .asString();
  }

  private static String groupChange(UUID participantId, String groupId) {
    return "{\"participantId\":\""
        + participantId
        + "\",\"fromGroupId\":null,\"toGroupId\":\""
        + groupId
        + "\"}";
  }

  private void assign(World w, String... changes) throws Exception {
    ok(assignRequest(w, changes));
  }

  private MockHttpServletRequestBuilder assignRequest(World w, String... changes) {
    return assignRequestAs(w.owner, w, changes);
  }

  private MockHttpServletRequestBuilder assignRequestAs(
      Cookie session, World w, String... changes) {
    return write(post(assignPath(w)), session, "{\"changes\":[" + String.join(",", changes) + "]}");
  }

  private MockHttpServletRequestBuilder reviewRequest(World w, String body) {
    return write(post(assignPath(w) + "/review"), w.owner, body);
  }

  private static String change(UUID participantId, String from, String to) {
    return "{\"participantId\":\""
        + participantId
        + "\",\"fromRoomId\":"
        + (from == null ? "null" : "\"" + from + "\"")
        + ",\"toRoomId\":"
        + (to == null ? "null" : "\"" + to + "\"")
        + "}";
  }

  private JsonNode publish(World w, boolean confirmUnassigned, boolean confirmNotLodging)
      throws Exception {
    return publishRequestBody(w, confirmUnassigned, confirmNotLodging, true);
  }

  private JsonNode publishRequestBody(
      World w, boolean confirmUnassigned, boolean confirmNotLodging, boolean notify)
      throws Exception {
    return json.readTree(ok(publishRequest(w, confirmUnassigned, confirmNotLodging, notify)));
  }

  private MockHttpServletRequestBuilder publishRequest(
      World w, boolean confirmUnassigned, boolean confirmNotLodging, boolean notify)
      throws Exception {
    long version = board(w).get("boardVersion").asLong();
    return write(
        post(roomsPath(w) + "/publish"),
        w.owner,
        "{\"expectedBoardVersion\":"
            + version
            + ",\"confirmUnassigned\":"
            + confirmUnassigned
            + ",\"confirmNotLodging\":"
            + confirmNotLodging
            + ",\"notify\":"
            + notify
            + "}");
  }

  private MockHttpServletRequestBuilder putScope(World w, String scope, int expectedVersion) {
    return write(
        put(eventPath(w) + "/participant-settings"),
        w.owner,
        "{\"roomRosterScope\":\"" + scope + "\",\"expectedVersion\":" + expectedVersion + "}");
  }

  private String ids(String key, String... values) {
    return json.writeValueAsString(Map.of(key, List.of(values)));
  }

  private static MockHttpServletRequestBuilder write(
      MockHttpServletRequestBuilder request, Cookie session, String body) {
    request.cookie(session, csrf()).header(CSRF_HEADER, CSRF);
    if (body != null) {
      request.contentType(MediaType.APPLICATION_JSON).content(body);
    }
    return request;
  }

  private String ok(MockHttpServletRequestBuilder request) throws Exception {
    return mvc.perform(request)
        .andExpect(status().isOk())
        .andReturn()
        .getResponse()
        .getContentAsString();
  }

  private String created(MockHttpServletRequestBuilder request) throws Exception {
    return mvc.perform(request)
        .andExpect(status().isCreated())
        .andReturn()
        .getResponse()
        .getContentAsString();
  }

  private ResultActions problem(MockHttpServletRequestBuilder request, int httpStatus, String code)
      throws Exception {
    return mvc.perform(request)
        .andExpect(status().is(httpStatus))
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.code").value(code));
  }

  // ---- reading results ----

  private static JsonNode person(JsonNode board, Person p) {
    for (JsonNode item : board.get("participants")) {
      if (item.get("participantId").asString().equals(p.id.toString())) {
        return item;
      }
    }
    throw new AssertionError("not on the board: " + p.id);
  }

  private static String lodgingOf(JsonNode board, Person p) {
    return person(board, p).get("lodging").asString();
  }

  private static List<Integer> nightsOf(JsonNode board, Person p) {
    List<Integer> out = new ArrayList<>();
    person(board, p).get("lodgingNights").forEach(n -> out.add(n.asInt()));
    return out;
  }

  private static Map<String, JsonNode> warnings(JsonNode list) {
    Map<String, JsonNode> out = new LinkedHashMap<>();
    list.forEach(item -> out.put(item.get("code").asString(), item));
    return out;
  }

  private static List<String> names(JsonNode list) {
    List<String> names = new ArrayList<>();
    list.forEach(item -> names.add(item.get("name").asString()));
    return names;
  }

  private static List<String> strings(JsonNode list) {
    List<String> out = new ArrayList<>();
    list.forEach(item -> out.add(item.asString()));
    return out;
  }

  private String roomOf(World w, UUID participantId) {
    return jdbc
        .queryForList(
            "SELECT room_id::text FROM room_assignments WHERE event_id = ? AND participant_id = ?",
            String.class,
            w.eventId,
            participantId)
        .stream()
        .findFirst()
        .orElse(null);
  }

  /** Unread ROOM_PUBLISHED notifications of the participant as "title|body|targetId". */
  private List<String> notificationsOf(Person p) {
    return jdbc.queryForList(
        "SELECT title || '|' || coalesce(body, '') || '|' || coalesce(target_id::text, 'null')"
            + " FROM notifications WHERE recipient_participant_id = ? AND kind = 'ROOM_PUBLISHED'"
            + " AND read_at IS NULL ORDER BY seq",
        String.class,
        p.id);
  }

  private void markAllRead(World w) {
    jdbc.update("UPDATE notifications SET read_at = now() WHERE event_id = ?", w.eventId);
  }

  private int unread(World w) {
    return count(
        "SELECT count(*) FROM notifications WHERE event_id = ? AND read_at IS NULL", w.eventId);
  }

  private int roomNotifications(World w) {
    return count(
        "SELECT count(*) FROM notifications WHERE event_id = ? AND kind = 'ROOM_PUBLISHED'",
        w.eventId);
  }

  private int auditCount(World w, String action) {
    return count(
        "SELECT count(*) FROM audit_logs WHERE event_id = ? AND action = ?", w.eventId, action);
  }

  private int count(String sql, Object... args) {
    return jdbc.queryForObject(sql, Integer.class, args);
  }

  // ---- fixtures ----

  private Cookie login(UUID userId) throws Exception {
    Cookie cookie =
        mvc.perform(
                post("/api/v1/operator/auth/login")
                    .cookie(csrf())
                    .header(CSRF_HEADER, CSRF)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"userId\":\"" + userId + "\"}"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getCookie(OPERATOR_COOKIE);
    assertThat(cookie).isNotNull();
    return cookie;
  }

  private static Cookie csrf() {
    return new Cookie(CSRF_COOKIE, CSRF);
  }

  private void lifecycle(UUID eventId, String status) {
    jdbc.update("UPDATE events SET lifecycle_status = ? WHERE id = ?", status, eventId);
  }

  private UUID user(String name) {
    UUID id = UUID.randomUUID();
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, ?)", id, name);
    return id;
  }

  private void member(UUID spaceId, UUID userId, String role) {
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, ?)", spaceId, userId, role);
  }

  private static String eventPath(World w) {
    return "/api/v1/operator/events/" + w.eventId;
  }

  private static String roomsPath(World w) {
    return eventPath(w) + "/rooms";
  }

  private static String assignPath(World w) {
    return eventPath(w) + "/room-assignments";
  }

  private record Person(UUID id, Cookie session) {}

  /** A space with an ACTIVE event created by its owner, plus a form with the 또래 question. */
  private World world() throws Exception {
    UUID spaceId = UUID.randomUUID();
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, 'Home')", spaceId);
    UUID ownerId = user("Owner");
    member(spaceId, ownerId, "OWNER");
    Cookie owner = login(ownerId);
    String created =
        created(
            write(
                post("/api/v1/operator/spaces/" + spaceId + "/events"),
                owner,
                "{\"name\":\"수련회\"}"));
    UUID eventId = UUID.fromString(json.readTree(created).get("eventId").asString());
    lifecycle(eventId, "ACTIVE");
    UUID formId =
        jdbc.queryForList("SELECT id FROM forms WHERE event_id = ?", UUID.class, eventId).stream()
            .findFirst()
            .orElse(null);
    if (formId == null) {
      formId = UUID.randomUUID();
      jdbc.update(
          "INSERT INTO forms (id, space_id, event_id) VALUES (?, ?, ?)", formId, spaceId, eventId);
    }
    UUID cohortField =
        jdbc
            .queryForList(
                "SELECT id FROM fields WHERE form_id = ? AND system_key = 'COHORT'",
                UUID.class,
                formId)
            .stream()
            .findFirst()
            .orElse(null);
    if (cohortField == null) {
      cohortField = UUID.randomUUID();
      jdbc.update(
          """
          INSERT INTO fields (
            id, space_id, event_id, form_id, kind, system_key, label, position, required)
          VALUES (?, ?, ?, ?, 'SYSTEM', 'COHORT', '또래',
            (SELECT coalesce(max(position), -1) + 1 FROM fields WHERE form_id = ?), true)
          """,
          cohortField,
          spaceId,
          eventId,
          formId,
          formId);
    }
    return new World(spaceId, eventId, formId, cohortField, owner, ownerId);
  }

  private final class World {
    final UUID spaceId;
    final UUID eventId;
    final UUID formId;
    final UUID cohortField;
    final Cookie owner;
    final UUID ownerId;
    final Map<UUID, UUID> applications = new LinkedHashMap<>();
    final Map<String, UUID> fieldIds = new HashMap<>();

    World(UUID spaceId, UUID eventId, UUID formId, UUID cohortField, Cookie owner, UUID ownerId) {
      this.spaceId = spaceId;
      this.eventId = eventId;
      this.formId = formId;
      this.cohortField = cohortField;
      this.owner = owner;
      this.ownerId = ownerId;
    }

    /** A SLOTS-mode setup with two nights and the ATTENDANCE, LODGING and NO_LODGING questions. */
    void lodgingQuestions() {
      setup("SLOTS");
      preset("ATTENDANCE", "SINGLE_CHOICE", ATTENDANCE_OPTIONS);
      preset("LODGING", "MULTI_CHOICE", LODGING_OPTIONS);
      preset("NO_LODGING", "MULTI_CHOICE", NO_LODGING_OPTIONS);
    }

    /** A RANGE-mode setup with the ATTENDANCE and arrival and departure slot questions. */
    void rangeSetup() {
      setup("RANGE");
      preset("ATTENDANCE", "SINGLE_CHOICE", ATTENDANCE_OPTIONS);
      preset("ARRIVAL_SLOT", "SINGLE_CHOICE", "{\"options\":[]}");
      preset("DEPARTURE_SLOT", "SINGLE_CHOICE", "{\"options\":[]}");
    }

    private void setup(String mode) {
      jdbc.update(
          "UPDATE forms SET setup = ?::jsonb WHERE id = ?",
          "{\"generatedFor\":{\"startDate\":\"2027-01-22\",\"endDate\":\"2027-01-24\"},"
              + "\"attendance\":{\"partial\":true,\"worshipOnly\":true,\"mode\":\""
              + mode
              + "\"}}",
          formId);
    }

    UUID operator(String name, String role) {
      UUID id = user(name);
      member(spaceId, id, "MEMBER");
      jdbc.update(
          "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, ?)",
          spaceId,
          eventId,
          id,
          role);
      return id;
    }

    UUID preset(String key, String type, String config) {
      UUID id = UUID.randomUUID();
      jdbc.update(
          """
          INSERT INTO fields (
            id, space_id, event_id, form_id, kind, label, position, answer_type, required,
            config, preset_key, preset_state)
          VALUES (?, ?, ?, ?, 'CUSTOM', ?,
            (SELECT coalesce(max(position), -1) + 1 FROM fields WHERE form_id = ?),
            ?, false, ?::jsonb, ?, '{"active": true}'::jsonb)
          """,
          id,
          spaceId,
          eventId,
          formId,
          key,
          formId,
          type,
          config,
          key);
      fieldIds.put(key, id);
      return id;
    }

    UUID custom(String label, String type, String config) {
      UUID id = UUID.randomUUID();
      jdbc.update(
          """
          INSERT INTO fields (
            id, space_id, event_id, form_id, kind, label, position, answer_type, required,
            config)
          VALUES (?, ?, ?, ?, 'CUSTOM', ?,
            (SELECT coalesce(max(position), -1) + 1 FROM fields WHERE form_id = ?),
            ?, false, ?::jsonb)
          """,
          id,
          spaceId,
          eventId,
          formId,
          label,
          formId,
          type,
          config);
      return id;
    }

    void answer(UUID participantId, UUID fieldId, String value) {
      jdbc.update(
          """
          INSERT INTO answers (id, space_id, event_id, application_id, field_id, value)
          VALUES (?, ?, ?, ?, ?, ?::jsonb)
          """,
          UUID.randomUUID(),
          spaceId,
          eventId,
          applications.get(participantId),
          fieldId,
          value);
    }

    /** Replaces the stored answer, like an application edit (A4) of that question. */
    void reanswer(UUID participantId, UUID fieldId, String value) {
      jdbc.update(
          "DELETE FROM answers WHERE application_id = ? AND field_id = ?",
          applications.get(participantId),
          fieldId);
      answer(participantId, fieldId, value);
    }

    /**
     * A participant with one SUBMITTED application and a participant session. {@code attendance} is
     * the ATTENDANCE answer, or null for none.
     */
    Person participant(String name, String phone, String cohort, String attendance) {
      UUID id = UUID.randomUUID();
      String digits = phone.replaceAll("[^0-9]", "");
      jdbc.update(
          """
          INSERT INTO participants (
            id, space_id, event_id, name, phone, phone_hash, phone_last4, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, now(), now())
          """,
          id,
          spaceId,
          eventId,
          name,
          phone,
          "h".repeat(64),
          digits.substring(digits.length() - 4));
      UUID applicationId = UUID.randomUUID();
      jdbc.update(
          """
          INSERT INTO applications (
            id, space_id, event_id, form_id, status, submitted_at, participant_id)
          VALUES (?, ?, ?, ?, 'SUBMITTED', now(), ?)
          """,
          applicationId,
          spaceId,
          eventId,
          formId,
          id);
      applications.put(id, applicationId);
      answer(id, cohortField, "{\"text\":\"" + cohort + "\"}");
      if (attendance != null) {
        answer(id, fieldIds.get("ATTENDANCE"), attendance);
      }
      return new Person(id, ParticipantSessions.open(jdbc, spaceId, eventId, id));
    }
  }
}
