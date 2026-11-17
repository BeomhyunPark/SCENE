package app.scene.event.group;

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
import app.scene.support.PostgresTestcontainer;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import jakarta.servlet.http.Cookie;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers;
import org.springframework.session.web.http.SessionRepositoryFilter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Group board, groups, assignments, and leaders (#299, DEC-072, api.md "조 편성"). */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class GroupHttpIT {

  private static final String OPERATOR_COOKIE = "SCENE_SESSION";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";
  private static final String BAD = "VALIDATION_FAILED";
  private static final String MISSING = "RESOURCE_NOT_FOUND";
  private static final String STALE = "CONCURRENT_MODIFICATION";
  private static final String NAME = "홍길동비밀이름";
  private static final String PHONE = "010-9876-5432";
  private static final String SECRET_CELL = "비밀셀이름";

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

  @Test
  void boardListsActiveParticipantsWithFilterAnswersAndWithdrawnApart() throws Exception {
    World w = world();
    UUID gender =
        w.preset("GENDER", "SINGLE_CHOICE", options("opt_female", "여성", "opt_male", "남성"));
    UUID attendance =
        w.preset(
            "ATTENDANCE",
            "SINGLE_CHOICE",
            options("opt_full", "전체", "opt_partial", "부분", "opt_worship", "집회만"));
    UUID middle = w.preset("MIDDLE_GROUP", "SHORT_TEXT", "{}");
    UUID cell = w.preset("CELL", "SHORT_TEXT", "{}");

    UUID full = w.participant("가나", "010-1000-0001", "94");
    w.answer(full, gender, "{\"optionId\":\"opt_female\"}");
    w.answer(full, attendance, "{\"optionId\":\"opt_worship\"}");
    w.answer(full, middle, "{\"text\":\"  청년1부 \"}");
    w.answer(full, cell, "{\"text\":\"다윗셀\"}");
    UUID none = w.participant("나다", "010-1000-0002", null);
    UUID blank = w.participant("다라", "010-1000-0003", "95");
    w.answer(blank, cell, "{\"text\":\"   \"}");
    w.answer(blank, gender, "{\"optionId\":\"opt_male\"}");
    UUID withdrawn = w.participant("철회자", "010-1000-0004", "97");

    JsonNode empty = board(w);
    assertThat(empty.propertyNames())
        .containsExactly(
            "eventStatus", "boardVersion", "groups", "participants", "withdrawn", "publication");
    assertThat(empty.get("eventStatus").asString()).isEqualTo("ACTIVE");
    assertThat(empty.get("boardVersion").asLong()).isZero();
    assertThat(empty.get("participants").size()).isEqualTo(4);
    assertThat(empty.get("publication").get("hasUnpublishedChanges").asBoolean()).isFalse();

    String g1 = createGroup(w, "1조");
    assign(w, change(withdrawn, null, g1), change(full, null, g1));
    w.withdraw(withdrawn);

    JsonNode b = board(w);
    assertThat(names(b.get("participants"))).containsExactly("가나", "나다", "다라");
    JsonNode first = b.get("participants").get(0);
    assertThat(first.propertyNames())
        .containsExactly(
            "participantId",
            "name",
            "cohort",
            "gender",
            "attendance",
            "middleGroup",
            "cell",
            "newcomer",
            "groupId",
            "leader",
            "publishedGroupId",
            "publishedLeader");
    assertThat(first.get("cohort").asString()).isEqualTo("94");
    assertThat(first.get("gender").get("optionId").asString()).isEqualTo("opt_female");
    assertThat(first.get("gender").get("label").asString()).isEqualTo("여성");
    assertThat(first.get("attendance").asString()).isEqualTo("WORSHIP_ONLY");
    assertThat(first.get("middleGroup").asString()).isEqualTo("청년1부");
    assertThat(first.get("cell").asString()).isEqualTo("다윗셀");
    assertThat(first.get("groupId").asString()).isEqualTo(g1);
    assertThat(first.get("leader").asBoolean()).isFalse();
    assertThat(first.get("publishedGroupId").isNull()).isTrue();
    assertThat(first.get("publishedLeader").asBoolean()).isFalse();
    assertThat(first.toString()).doesNotContain(PHONE).doesNotContain("0001");

    JsonNode bare = item(b.get("participants"), none);
    assertThat(bare.get("cohort").isNull()).isTrue();
    assertThat(bare.get("gender").isNull()).isTrue();
    assertThat(bare.get("attendance").asString()).isEqualTo("FULL");
    assertThat(bare.get("middleGroup").isNull()).isTrue();
    assertThat(bare.get("cell").isNull()).isTrue();
    // No NEWCOMER question on this form: no answer for anyone.
    assertThat(bare.get("newcomer").isNull()).isTrue();
    assertThat(first.get("newcomer").isNull()).isTrue();
    assertThat(bare.get("groupId").isNull()).isTrue();
    JsonNode spaces = item(b.get("participants"), blank);
    assertThat(spaces.get("cell").isNull()).isTrue();
    assertThat(spaces.get("gender").get("label").asString()).isEqualTo("남성");

    JsonNode gone = b.get("withdrawn");
    assertThat(gone.size()).isEqualTo(1);
    assertThat(gone.get(0).propertyNames()).containsExactly("participantId", "name", "groupId");
    assertThat(gone.get(0).get("participantId").asString()).isEqualTo(withdrawn.toString());
    assertThat(gone.get(0).get("groupId").asString()).isEqualTo(g1);

    JsonNode publication = b.get("publication");
    assertThat(publication.propertyNames())
        .containsExactly(
            "lastPublishedAt",
            "lastPublishedByDisplayName",
            "lastPublishedBoardVersion",
            "activeCount",
            "assignedCount",
            "unassignedCount",
            "changedParticipantCount",
            "groupChanges",
            "hasUnpublishedChanges");
    assertThat(publication.get("lastPublishedAt").isNull()).isTrue();
    assertThat(publication.get("lastPublishedByDisplayName").isNull()).isTrue();
    assertThat(publication.get("lastPublishedBoardVersion").isNull()).isTrue();
    assertThat(publication.get("activeCount").asLong()).isEqualTo(3);
    assertThat(publication.get("assignedCount").asLong()).isEqualTo(1);
    assertThat(publication.get("unassignedCount").asLong()).isEqualTo(2);
    assertThat(publication.get("changedParticipantCount").asLong()).isEqualTo(1);
    assertThat(publication.get("groupChanges").asLong()).isEqualTo(1);
    assertThat(publication.get("hasUnpublishedChanges").asBoolean()).isTrue();

    // A hidden question reads as no answer; a hidden ATTENDANCE question reads as FULL.
    jdbc.update("UPDATE fields SET hidden = true WHERE id IN (?, ?, ?)", gender, attendance, cell);
    JsonNode hidden = item(board(w).get("participants"), full);
    assertThat(hidden.get("gender").isNull()).isTrue();
    assertThat(hidden.get("attendance").asString()).isEqualTo("FULL");
    assertThat(hidden.get("cell").isNull()).isTrue();
    assertThat(hidden.get("middleGroup").asString()).isEqualTo("청년1부");
  }

  @Test
  void boardGivesTheNewcomerAnswerAsTrueFalseOrNull() throws Exception {
    World w = world();
    UUID yes = w.participant("가새", "010-1100-0001", "94");
    UUID no = w.participant("나기존", "010-1100-0002", "95");
    UUID before = w.participant("다이전", "010-1100-0003", "96");

    // The question does not exist yet.
    assertThat(item(board(w).get("participants"), yes).get("newcomer").isNull()).isTrue();

    UUID newcomer = w.preset("NEWCOMER", "YES_NO", "{\"style\":\"YES_NO\"}");
    w.answer(yes, newcomer, "{\"value\":true}");
    w.answer(no, newcomer, "{\"value\":false}");
    JsonNode b = board(w);
    assertThat(item(b.get("participants"), yes).get("newcomer").asBoolean()).isTrue();
    assertThat(item(b.get("participants"), no).get("newcomer").isBoolean()).isTrue();
    assertThat(item(b.get("participants"), no).get("newcomer").asBoolean()).isFalse();
    // Applied before the switch went on: no answer.
    assertThat(item(b.get("participants"), before).get("newcomer").isNull()).isTrue();

    // Turned off: no answer for anyone, the stored answers stay.
    jdbc.update("UPDATE fields SET hidden = true WHERE id = ?", newcomer);
    JsonNode off = board(w);
    assertThat(item(off.get("participants"), yes).get("newcomer").isNull()).isTrue();
    assertThat(item(off.get("participants"), no).get("newcomer").isNull()).isTrue();
  }

  @Test
  void groupsAreCreatedRenamedReorderedAndDeletedWithVersions() throws Exception {
    World w = world();
    JsonNode created =
        json.readTree(created(write(post(groupsPath(w)), w.owner, "{\"name\":\" 1조 \"}")));
    assertThat(created.propertyNames()).containsExactly("group", "boardVersion");
    JsonNode group = created.get("group");
    assertThat(group.propertyNames()).containsExactly("groupId", "name", "sortOrder", "version");
    assertThat(group.get("name").asString()).isEqualTo("1조");
    assertThat(group.get("sortOrder").asInt()).isZero();
    assertThat(group.get("version").asInt()).isZero();
    assertThat(created.get("boardVersion").asLong()).isEqualTo(1);
    String g1 = group.get("groupId").asString();
    String g2 = createGroup(w, "2조");
    String g3 = createGroup(w, "3조");
    assertThat(board(w).get("groups").get(2).get("sortOrder").asInt()).isEqualTo(2);

    problem(write(post(groupsPath(w)), w.owner, "{\"name\":\"1조\"}"), 409, "CONFLICT");
    problem(write(post(groupsPath(w)), w.owner, "{\"name\":\"  \"}"), 400, BAD)
        .andExpect(jsonPath("$.errors[0].field").value("name"));
    problem(write(post(groupsPath(w)), w.owner, "{\"name\":\"" + "가".repeat(51) + "\"}"), 400, BAD);
    problem(write(post(groupsPath(w)), w.owner, null), 400, BAD);
    created(write(post(groupsPath(w)), w.owner, "{\"name\":\"" + "가".repeat(50) + "\"}"));
    assertThat(boardVersion(w)).isEqualTo(4);

    JsonNode renamed = json.readTree(ok(rename(w, g1, "첫째 조", 0)));
    assertThat(renamed.get("group").get("name").asString()).isEqualTo("첫째 조");
    assertThat(renamed.get("group").get("version").asInt()).isEqualTo(1);
    assertThat(renamed.get("boardVersion").asLong()).isEqualTo(5);
    problem(rename(w, g1, "다른 이름", 0), 409, STALE).andExpect(jsonPath("$.version").value(1));
    JsonNode same = json.readTree(ok(rename(w, g1, "첫째 조", 1)));
    assertThat(same.get("group").get("version").asInt()).isEqualTo(1);
    assertThat(same.get("boardVersion").asLong()).isEqualTo(5);
    problem(rename(w, g1, "2조", 1), 409, "CONFLICT");
    problem(write(patch(groupPath(w, g1)), w.owner, "{\"name\":\"x\"}"), 400, BAD)
        .andExpect(jsonPath("$.errors[0].field").value("expectedVersion"));
    problem(rename(w, UUID.randomUUID().toString(), "x", 0), 404, MISSING);
    jdbc.update("DELETE FROM groups WHERE event_id = ? AND name LIKE '가가%'", w.eventId);

    String order = "{\"groupIds\":[\"" + g3 + "\",\"" + g1 + "\",\"" + g2 + "\"]}";
    JsonNode reordered = json.readTree(ok(write(put(groupsPath(w) + "/order"), w.owner, order)));
    assertThat(reordered.propertyNames()).containsExactly("boardVersion");
    assertThat(reordered.get("boardVersion").asLong()).isEqualTo(6);
    assertThat(groupIds(board(w))).containsExactly(g3, g1, g2);
    JsonNode unchanged = json.readTree(ok(write(put(groupsPath(w) + "/order"), w.owner, order)));
    assertThat(unchanged.get("boardVersion").asLong()).isEqualTo(6);
    for (String wrong :
        List.of(
            "{\"groupIds\":[\"" + g3 + "\",\"" + g1 + "\"]}",
            "{\"groupIds\":[\"" + g3 + "\",\"" + g1 + "\",\"" + g1 + "\"]}",
            "{\"groupIds\":[\""
                + g3
                + "\",\""
                + g1
                + "\",\""
                + g2
                + "\",\""
                + UUID.randomUUID()
                + "\"]}",
            "{\"groupIds\":[\"" + g3 + "\",\"" + g1 + "\",\"" + UUID.randomUUID() + "\"]}")) {
      problem(write(put(groupsPath(w) + "/order"), w.owner, wrong), 409, "CONFLICT");
    }
    problem(write(put(groupsPath(w) + "/order"), w.owner, "{\"groupIds\":[\"x\"]}"), 400, BAD)
        .andExpect(jsonPath("$.errors[0].field").value("groupIds"));

    UUID a = w.participant("가", "010-2000-0001", "94");
    UUID b = w.participant("나", "010-2000-0002", "95");
    UUID gone = w.participant("다", "010-2000-0003", "96");
    assign(w, change(a, null, g1), change(b, null, g1), change(gone, null, g1));
    ok(leaders(w, g1, 1, a));
    w.withdraw(gone);
    int logs = logCount(w);

    problem(write(delete(groupPath(w, g1)), w.owner, null), 400, BAD)
        .andExpect(jsonPath("$.errors[0].field").value("expectedVersion"));
    problem(write(delete(groupPath(w, g1) + "?expectedVersion=x"), w.owner, null), 400, BAD);
    problem(write(delete(groupPath(w, g1) + "?expectedVersion=1"), w.owner, null), 409, STALE)
        .andExpect(jsonPath("$.version").value(2));
    problem(
        write(
            delete(groupPath(w, UUID.randomUUID().toString()) + "?expectedVersion=0"),
            w.owner,
            null),
        404,
        MISSING);
    long before = boardVersion(w);
    JsonNode deleted =
        json.readTree(ok(write(delete(groupPath(w, g1) + "?expectedVersion=2"), w.owner, null)));
    assertThat(deleted.propertyNames()).containsExactly("unassignedCount", "boardVersion");
    assertThat(deleted.get("unassignedCount").asInt()).isEqualTo(3);
    assertThat(deleted.get("boardVersion").asLong()).isEqualTo(before + 1);
    JsonNode after = board(w);
    assertThat(groupIds(after)).containsExactly(g3, g2);
    assertThat(item(after.get("participants"), a).get("groupId").isNull()).isTrue();
    assertThat(item(after.get("participants"), a).get("leader").asBoolean()).isFalse();
    assertThat(after.get("withdrawn").size()).isZero();
    assertThat(logCount(w)).isEqualTo(logs + 3);
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT participant_id, from_group_id, to_group_id, leader_before, leader_after"
                + " FROM group_assignment_logs WHERE event_id = ? AND cause = 'GROUP_DELETED'",
            w.eventId);
    assertThat(rows).hasSize(3);
    for (Map<String, Object> row : rows) {
      assertThat(row.get("from_group_id").toString()).isEqualTo(g1);
      assertThat(row.get("to_group_id")).isNull();
      assertThat(row.get("leader_after")).isEqualTo(false);
      assertThat(row.get("leader_before")).isEqualTo(row.get("participant_id").equals(a));
    }
  }

  @Test
  void groupCountIsCapped() throws Exception {
    World w = world();
    for (int i = 0; i < GroupService.GROUPS_MAX; i++) {
      jdbc.update(
          """
          INSERT INTO groups (
            id, space_id, event_id, name, sort_order, version, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 0, ?, now(), now())
          """,
          UUID.randomUUID(),
          w.spaceId,
          w.eventId,
          "조" + i,
          i,
          w.ownerId);
    }
    problem(write(post(groupsPath(w)), w.owner, "{\"name\":\"새 조\"}"), 409, "CONFLICT");
  }

  @Test
  void assignmentsMoveUnassignAndTreatTheDestinationAsDone() throws Exception {
    World w = world();
    String g1 = createGroup(w, "1조");
    String g2 = createGroup(w, "2조");
    UUID a = w.participant("가", "010-3000-0001", "94");
    UUID b = w.participant("나", "010-3000-0002", "95");
    long start = boardVersion(w);

    JsonNode first = assign(w, change(a, null, g1), change(b, null, g1));
    assertThat(first.propertyNames()).containsExactly("changed", "alreadyApplied", "boardVersion");
    assertThat(first.get("changed").asInt()).isEqualTo(2);
    assertThat(first.get("alreadyApplied").asInt()).isZero();
    assertThat(first.get("boardVersion").asLong()).isEqualTo(start + 1);

    JsonNode replay = assign(w, change(a, null, g1), change(b, null, g1));
    assertThat(replay.get("changed").asInt()).isZero();
    assertThat(replay.get("alreadyApplied").asInt()).isEqualTo(2);
    assertThat(replay.get("boardVersion").asLong()).isEqualTo(start + 1);
    assertThat(logCount(w)).isEqualTo(2);

    ok(leaders(w, g1, 0, a));
    int groupVersion = groupVersion(w, g1);
    JsonNode moved = assign(w, change(a, g1, g2), change(b, g1, null));
    assertThat(moved.get("changed").asInt()).isEqualTo(2);
    assertThat(groupVersion(w, g1)).isEqualTo(groupVersion);
    JsonNode b2 = board(w);
    assertThat(item(b2.get("participants"), a).get("groupId").asString()).isEqualTo(g2);
    assertThat(item(b2.get("participants"), a).get("leader").asBoolean()).isFalse();
    assertThat(item(b2.get("participants"), b).get("groupId").isNull()).isTrue();
    assertThat(assignmentRows(w)).isEqualTo(1);

    Map<String, Object> log =
        jdbc.queryForMap(
            "SELECT from_group_id, to_group_id, leader_before, leader_after, cause, actor_user_id"
                + " FROM group_assignment_logs WHERE event_id = ? AND participant_id = ?"
                + " ORDER BY seq DESC LIMIT 1",
            w.eventId,
            a);
    assertThat(log.get("from_group_id").toString()).isEqualTo(g1);
    assertThat(log.get("to_group_id").toString()).isEqualTo(g2);
    assertThat(log.get("leader_before")).isEqualTo(true);
    assertThat(log.get("leader_after")).isEqualTo(false);
    assertThat(log.get("cause")).isEqualTo("MOVE");
    assertThat(log.get("actor_user_id")).isEqualTo(w.ownerId);

    JsonNode mixed = assign(w, change(a, g1, g2), change(b, null, g2));
    assertThat(mixed.get("changed").asInt()).isEqualTo(1);
    assertThat(mixed.get("alreadyApplied").asInt()).isEqualTo(1);
  }

  @Test
  void oneConflictSavesNothing() throws Exception {
    World w = world();
    String g1 = createGroup(w, "1조");
    String g2 = createGroup(w, "2조");
    UUID a = w.participant("가", "010-4000-0001", "94");
    UUID b = w.participant("나", "010-4000-0002", "95");
    UUID c = w.participant("다", "010-4000-0003", "96");
    assign(w, change(b, null, g1));
    long version = boardVersion(w);
    int logs = logCount(w);

    String requestId = "req-" + UUID.randomUUID();
    String body =
        mvc.perform(
                assignRequest(w, change(a, null, g2), change(b, null, g2), change(c, g2, g1))
                    .header("X-Request-Id", requestId))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value(STALE))
            .andExpect(jsonPath("$.traceId").value(requestId))
            .andReturn()
            .getResponse()
            .getContentAsString();
    JsonNode problem = json.readTree(body);
    assertThat(problem.get("boardVersion").asLong()).isEqualTo(version);
    JsonNode conflicts = problem.get("conflicts");
    assertThat(conflicts.size()).isEqualTo(2);
    Map<String, String> byParticipant = new LinkedHashMap<>();
    for (JsonNode conflict : conflicts) {
      assertThat(conflict.propertyNames()).containsExactly("participantId", "currentGroupId");
      JsonNode current = conflict.get("currentGroupId");
      byParticipant.put(
          conflict.get("participantId").asString(), current.isNull() ? null : current.asString());
    }
    assertThat(byParticipant).containsEntry(b.toString(), g1).containsEntry(c.toString(), null);

    JsonNode after = board(w);
    assertThat(after.get("boardVersion").asLong()).isEqualTo(version);
    assertThat(item(after.get("participants"), a).get("groupId").isNull()).isTrue();
    assertThat(item(after.get("participants"), b).get("groupId").asString()).isEqualTo(g1);
    assertThat(logCount(w)).isEqualTo(logs);

    // A from group that no longer exists is a conflict, not a missing target.
    problem(assignRequest(w, change(b, UUID.randomUUID().toString(), g2)), 409, STALE);
  }

  @Test
  void assignmentRequestsAreValidatedAndWithdrawnCannotJoin() throws Exception {
    World w = world();
    String g1 = createGroup(w, "1조");
    UUID a = w.participant("가", "010-5000-0001", "94");
    UUID gone = w.participant("나", "010-5000-0002", "95");
    assign(w, change(gone, null, g1));
    w.withdraw(gone);
    String path = "/api/v1/operator/events/" + w.eventId + "/group-assignments";

    for (String wrong :
        List.of(
            "{}",
            "{\"changes\":[]}",
            "{\"changes\":{}}",
            "{\"changes\":[{\"participantId\":\"" + a + "\",\"toGroupId\":null}]}",
            "{\"changes\":[{\"participantId\":\"" + a + "\",\"fromGroupId\":null}]}",
            "{\"changes\":[{\"participantId\":\"x\",\"fromGroupId\":null,\"toGroupId\":null}]}",
            "{\"changes\":[{\"participantId\":\""
                + a
                + "\",\"fromGroupId\":1,\"toGroupId\":null}]}",
            "{\"changes\":[" + change(a, null, g1) + "," + change(a, null, null) + "]}")) {
      problem(write(post(path), w.owner, wrong), 400, BAD)
          .andExpect(jsonPath("$.errors[0].field").value("changes"));
    }
    List<String> many = new ArrayList<>();
    for (int i = 0; i <= GroupService.CHANGES_MAX; i++) {
      many.add(change(UUID.randomUUID(), null, null));
    }
    problem(write(post(path), w.owner, "{\"changes\":[" + String.join(",", many) + "]}"), 400, BAD);
    many.remove(0);
    problem(
        write(post(path), w.owner, "{\"changes\":[" + String.join(",", many) + "]}"), 404, MISSING);

    problem(assignRequest(w, change(UUID.randomUUID(), null, g1)), 404, MISSING);
    problem(assignRequest(w, change(a, null, UUID.randomUUID().toString())), 404, MISSING);
    World elsewhere = world();
    UUID stranger = elsewhere.participant("남", "010-5000-0009", "90");
    String foreignGroup = createGroup(elsewhere, "남의 조");
    problem(assignRequest(w, change(stranger, null, g1)), 404, MISSING);
    problem(assignRequest(w, change(a, null, foreignGroup)), 404, MISSING);

    String g2 = createGroup(w, "2조");
    problem(
            assignRequest(w, change(gone, g1, g2), change(a, null, g2)),
            409,
            "INVALID_STATE_TRANSITION")
        .andExpect(jsonPath("$.reason").value("APPLICATION_NOT_SUBMITTED"))
        .andExpect(jsonPath("$.participantIds[0]").value(gone.toString()))
        .andExpect(jsonPath("$.participantIds.length()").value(1));
    assertThat(item(board(w).get("participants"), a).get("groupId").isNull()).isTrue();
    JsonNode out = assign(w, change(gone, g1, null));
    assertThat(out.get("changed").asInt()).isEqualTo(1);
    assertThat(board(w).get("withdrawn").size()).isZero();
  }

  @Test
  void leadersAreActiveMembersOfTheGroupUpToThree() throws Exception {
    World w = world();
    String g1 = createGroup(w, "1조");
    String g2 = createGroup(w, "2조");
    UUID a = w.participant("가", "010-6000-0001", "94");
    UUID b = w.participant("나", "010-6000-0002", "95");
    UUID c = w.participant("다", "010-6000-0003", "96");
    UUID d = w.participant("라", "010-6000-0004", "97");
    UUID outsider = w.participant("마", "010-6000-0005", "98");
    UUID gone = w.participant("바", "010-6000-0006", "99");
    assign(
        w,
        change(a, null, g1),
        change(b, null, g1),
        change(c, null, g1),
        change(d, null, g1),
        change(gone, null, g1),
        change(outsider, null, g2));
    w.withdraw(gone);
    long version = boardVersion(w);

    JsonNode set = json.readTree(ok(leaders(w, g1, 0, a, b)));
    assertThat(set.propertyNames()).containsExactly("group", "leaderIds", "boardVersion");
    assertThat(set.get("group").get("version").asInt()).isEqualTo(1);
    assertThat(set.get("leaderIds").size()).isEqualTo(2);
    assertThat(set.get("leaderIds").get(0).asString()).isEqualTo(a.toString());
    assertThat(set.get("boardVersion").asLong()).isEqualTo(version + 1);
    JsonNode after = board(w);
    assertThat(item(after.get("participants"), a).get("leader").asBoolean()).isTrue();
    assertThat(item(after.get("participants"), c).get("leader").asBoolean()).isFalse();

    JsonNode same = json.readTree(ok(leaders(w, g1, 1, b, a)));
    assertThat(same.get("group").get("version").asInt()).isEqualTo(1);
    assertThat(same.get("boardVersion").asLong()).isEqualTo(version + 1);
    problem(leaders(w, g1, 0, c), 409, STALE).andExpect(jsonPath("$.version").value(1));
    problem(leaders(w, g1, 1, a, outsider, gone), 409, "CONFLICT")
        .andExpect(jsonPath("$.reason").value("LEADER_NOT_MEMBER"))
        .andExpect(jsonPath("$.participantIds.length()").value(2));
    problem(leaders(w, g1, 1, a, b, c, d), 400, BAD)
        .andExpect(jsonPath("$.errors[0].field").value("participantIds"));
    problem(leaders(w, g1, 1, a, a), 400, BAD)
        .andExpect(jsonPath("$.errors[0].field").value("participantIds"));
    problem(write(put(groupPath(w, g1) + "/leaders"), w.owner, "{\"participantIds\":[]}"), 400, BAD)
        .andExpect(jsonPath("$.errors[0].field").value("expectedVersion"));
    problem(leaders(w, UUID.randomUUID().toString(), 0, a), 404, MISSING);

    JsonNode three = json.readTree(ok(leaders(w, g1, 1, b, c, d)));
    assertThat(three.get("group").get("version").asInt()).isEqualTo(2);
    List<Map<String, Object>> leaderLogs =
        jdbc.queryForList(
            "SELECT participant_id, leader_before, leader_after FROM group_assignment_logs"
                + " WHERE event_id = ? AND cause = 'LEADER' ORDER BY seq",
            w.eventId);
    assertThat(leaderLogs).hasSize(5);
    JsonNode cleared = json.readTree(ok(leaders(w, g1, 2)));
    assertThat(cleared.get("leaderIds").size()).isZero();
    assertThat(cleared.get("group").get("version").asInt()).isEqualTo(3);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM group_assignments WHERE event_id = ? AND leader",
                Integer.class,
                w.eventId))
        .isZero();
  }

  @Test
  void twoOperatorsMovingAtOnceKeepBothOrRejectTheStaleOne() throws Exception {
    World w = world();
    String g1 = createGroup(w, "1조");
    String g2 = createGroup(w, "2조");
    UUID a = w.participant("가", "010-7000-0001", "94");
    UUID b = w.participant("나", "010-7000-0002", "95");
    UUID c = w.participant("다", "010-7000-0003", "96");
    UUID managerId = w.operator("Manager", "MANAGER");
    grant(w, managerId, "GROUP_WRITE");
    Cookie manager = login(managerId);
    long start = boardVersion(w);

    List<MvcResult> different =
        race(
            assignRequest(w.owner, w, change(a, null, g1)),
            assignRequest(manager, w, change(b, null, g2)));
    for (MvcResult result : different) {
      assertThat(result.getResponse().getStatus()).isEqualTo(200);
    }
    assertThat(boardVersion(w)).isEqualTo(start + 2);

    List<MvcResult> same =
        race(
            assignRequest(w.owner, w, change(c, null, g1)),
            assignRequest(manager, w, change(c, null, g2)));
    List<Integer> statuses = new ArrayList<>();
    for (MvcResult result : same) {
      statuses.add(result.getResponse().getStatus());
    }
    assertThat(statuses).containsExactlyInAnyOrder(200, 409);
    assertThat(boardVersion(w)).isEqualTo(start + 3);
    assertThat(logCount(w)).isEqualTo(3);
  }

  @Test
  void groupWriteIsOwnerOnlyByDefaultAndSpaceOwnerOrAdminMayRead() throws Exception {
    World w = world();
    String g1 = createGroup(w, "1조");
    UUID p = w.participant(NAME, PHONE, "94");

    for (String role : List.of("MANAGER", "STAFF")) {
      Cookie operator = login(w.operator(role, role));
      problem(get(boardPath(w)).cookie(operator), 403, "FORBIDDEN");
      problem(write(post(groupsPath(w)), operator, "{\"name\":\"x\"}"), 403, "FORBIDDEN");
      problem(write(post(groupsPath(w)), operator, "{}"), 403, "FORBIDDEN");
      problem(rename(operator, w, g1, "x", 0), 403, "FORBIDDEN");
      problem(
          write(delete(groupPath(w, g1) + "?expectedVersion=0"), operator, null), 403, "FORBIDDEN");
      problem(write(put(groupsPath(w) + "/order"), operator, "{}"), 403, "FORBIDDEN");
      problem(assignRequest(operator, w, change(p, null, g1)), 403, "FORBIDDEN");
      problem(leaders(operator, w, g1, 0), 403, "FORBIDDEN");
    }

    UUID grantedId = w.operator("Granted", "STAFF");
    grant(w, grantedId, "GROUP_WRITE");
    Cookie granted = login(grantedId);
    ok(get(boardPath(w)).cookie(granted));
    assertThat(assignRequestOk(granted, w, change(p, null, g1)).get("changed").asInt())
        .isEqualTo(1);

    for (String spaceRole : List.of("ADMIN", "OWNER")) {
      UUID id = user(spaceRole);
      member(w.spaceId, id, spaceRole);
      Cookie session = login(id);
      JsonNode read = json.readTree(ok(get(boardPath(w)).cookie(session)));
      assertThat(read.get("participants").size()).isEqualTo(1);
      problem(write(post(groupsPath(w)), session, "{\"name\":\"y\"}"), 403, "FORBIDDEN");
      problem(assignRequest(session, w, change(p, g1, null)), 403, "FORBIDDEN");
    }
    UUID memberId = user("Member");
    member(w.spaceId, memberId, "MEMBER");
    problem(get(boardPath(w)).cookie(login(memberId)), 403, "FORBIDDEN");

    World elsewhere = world();
    problem(get(boardPath(w)).cookie(elsewhere.owner), 404, MISSING);
    problem(write(post(groupsPath(w)), elsewhere.owner, "{\"name\":\"z\"}"), 404, MISSING);
    problem(assignRequest(elsewhere.owner, w, change(p, g1, null)), 404, MISSING);
    problem(rename(w, createGroup(elsewhere, "남의 조"), "x", 0), 404, MISSING);
    problem(
        get("/api/v1/operator/events/" + UUID.randomUUID() + "/group-board").cookie(w.owner),
        404,
        MISSING);
  }

  @Test
  void endedAndArchivedEventsBlockWritesButNotTheBoard() throws Exception {
    World w = world();
    String g1 = createGroup(w, "1조");
    UUID p = w.participant(NAME, PHONE, "94");

    lifecycle(w.eventId, "DRAFT");
    String g2 = createGroup(w, "2조");
    assign(w, change(p, null, g1));

    for (String[] state :
        List.of(
            new String[] {"ENDED", "EVENT_ENDED"}, new String[] {"ARCHIVED", "EVENT_ARCHIVED"})) {
      lifecycle(w.eventId, state[0]);
      problem(write(post(groupsPath(w)), w.owner, "{\"name\":\"3조\"}"), 409, state[1]);
      problem(rename(w, g1, "x", 0), 409, state[1]);
      problem(write(delete(groupPath(w, g1) + "?expectedVersion=0"), w.owner, null), 409, state[1]);
      problem(
          write(
              put(groupsPath(w) + "/order"),
              w.owner,
              "{\"groupIds\":[\"" + g2 + "\",\"" + g1 + "\"]}"),
          409,
          state[1]);
      problem(assignRequest(w, change(p, g1, g2)), 409, state[1]);
      problem(assignRequest(w, change(p, g1, g1)), 409, state[1]);
      problem(leaders(w, g1, 0, p), 409, state[1]);
      // The body is checked before the state.
      problem(write(post(groupsPath(w)), w.owner, "{}"), 400, BAD);
      JsonNode b = board(w);
      assertThat(b.get("eventStatus").asString()).isEqualTo(state[0]);
      assertThat(item(b.get("participants"), p).get("groupId").asString()).isEqualTo(g1);
    }
    // Missing targets come after the state.
    problem(rename(w, UUID.randomUUID().toString(), "x", 0), 409, "EVENT_ARCHIVED");
  }

  @Test
  void historyAuditAndLogsCarryNoNamePhoneOrAnswer() throws Exception {
    ListAppender<ILoggingEvent> logs = new ListAppender<>();
    logs.start();
    Logger app = (Logger) LoggerFactory.getLogger("app.scene");
    app.addAppender(logs);
    try {
      World w = world();
      UUID cell = w.preset("CELL", "SHORT_TEXT", "{}");
      UUID p = w.participant(NAME, PHONE, "94");
      w.answer(p, cell, "{\"text\":\"" + SECRET_CELL + "\"}");
      int audits = auditCount(w.eventId);
      String g1 = createGroup(w, "1조");
      String g2 = createGroup(w, "2조");
      assign(w, change(p, null, g1));
      ok(leaders(w, g1, 0, p));
      assign(w, change(p, g1, g2));
      problem(assignRequest(w, change(p, g1, null)), 409, STALE);
      ok(write(delete(groupPath(w, g2) + "?expectedVersion=0"), w.owner, null));

      assertThat(auditCount(w.eventId)).isEqualTo(audits);
      String history =
          String.join(
              "\n",
              jdbc.queryForList(
                  "SELECT row_to_json(l)::text FROM group_assignment_logs l WHERE event_id = ?",
                  String.class,
                  w.eventId));
      assertThat(history).contains(p.toString());
      assertThat(history).doesNotContain(NAME).doesNotContain(PHONE).doesNotContain(SECRET_CELL);
      for (ILoggingEvent logged : logs.list) {
        assertThat(logged.getFormattedMessage())
            .doesNotContain(NAME)
            .doesNotContain(PHONE)
            .doesNotContain(SECRET_CELL);
      }
    } finally {
      app.detachAppender(logs);
    }
  }

  private List<MvcResult> race(
      MockHttpServletRequestBuilder first, MockHttpServletRequestBuilder second) throws Exception {
    CountDownLatch start = new CountDownLatch(1);
    ExecutorService pool = Executors.newFixedThreadPool(2);
    try {
      List<Future<MvcResult>> futures = new ArrayList<>();
      for (MockHttpServletRequestBuilder request : List.of(first, second)) {
        Callable<MvcResult> call =
            () -> {
              start.await();
              return mvc.perform(request).andReturn();
            };
        futures.add(pool.submit(call));
      }
      start.countDown();
      List<MvcResult> results = new ArrayList<>();
      for (Future<MvcResult> future : futures) {
        results.add(future.get(30, TimeUnit.SECONDS));
      }
      return results;
    } finally {
      pool.shutdownNow();
    }
  }

  private JsonNode board(World w) throws Exception {
    return json.readTree(ok(get(boardPath(w)).cookie(w.owner)));
  }

  private long boardVersion(World w) throws Exception {
    return board(w).get("boardVersion").asLong();
  }

  private int groupVersion(World w, String groupId) throws Exception {
    for (JsonNode group : board(w).get("groups")) {
      if (group.get("groupId").asString().equals(groupId)) {
        return group.get("version").asInt();
      }
    }
    throw new AssertionError("group is not on the board");
  }

  private String createGroup(World w, String name) throws Exception {
    String body = json.writeValueAsString(Map.of("name", name));
    return json.readTree(created(write(post(groupsPath(w)), w.owner, body)))
        .get("group")
        .get("groupId")
        .asString();
  }

  private MockHttpServletRequestBuilder rename(World w, String groupId, String name, int version) {
    return rename(w.owner, w, groupId, name, version);
  }

  private MockHttpServletRequestBuilder rename(
      Cookie session, World w, String groupId, String name, int version) {
    String body = json.writeValueAsString(Map.of("name", name, "expectedVersion", version));
    return write(patch(groupPath(w, groupId)), session, body);
  }

  private MockHttpServletRequestBuilder leaders(World w, String groupId, int version, UUID... ids) {
    return leaders(w.owner, w, groupId, version, ids);
  }

  private MockHttpServletRequestBuilder leaders(
      Cookie session, World w, String groupId, int version, UUID... ids) {
    List<String> list = new ArrayList<>();
    for (UUID id : ids) {
      list.add(id.toString());
    }
    String body =
        json.writeValueAsString(Map.of("participantIds", list, "expectedVersion", version));
    return write(put(groupPath(w, groupId) + "/leaders"), session, body);
  }

  private JsonNode assign(World w, String... changes) throws Exception {
    return assignRequestOk(w.owner, w, changes);
  }

  private JsonNode assignRequestOk(Cookie session, World w, String... changes) throws Exception {
    return json.readTree(ok(assignRequest(session, w, changes)));
  }

  private MockHttpServletRequestBuilder assignRequest(World w, String... changes) {
    return assignRequest(w.owner, w, changes);
  }

  private MockHttpServletRequestBuilder assignRequest(Cookie session, World w, String... changes) {
    return write(
        post("/api/v1/operator/events/" + w.eventId + "/group-assignments"),
        session,
        "{\"changes\":[" + String.join(",", changes) + "]}");
  }

  private static String change(UUID participantId, String from, String to) {
    return "{\"participantId\":\""
        + participantId
        + "\",\"fromGroupId\":"
        + quoted(from)
        + ",\"toGroupId\":"
        + quoted(to)
        + "}";
  }

  private static String quoted(String value) {
    return value == null ? "null" : "\"" + value + "\"";
  }

  private static String options(String... idAndLabel) {
    List<String> items = new ArrayList<>();
    for (int i = 0; i < idAndLabel.length; i += 2) {
      items.add(
          "{\"optionId\":\""
              + idAndLabel[i]
              + "\",\"label\":\""
              + idAndLabel[i + 1]
              + "\",\"group\":null,\"hidden\":false,\"showWhen\":null}");
    }
    return "{\"options\":["
        + String.join(",", items)
        + "],\"allowOther\":false,\"display\":\"LIST\"}";
  }

  private static JsonNode item(JsonNode list, UUID participantId) {
    for (JsonNode item : list) {
      if (item.get("participantId").asString().equals(participantId.toString())) {
        return item;
      }
    }
    throw new AssertionError("participant is not on the board");
  }

  private static List<String> names(JsonNode list) {
    List<String> names = new ArrayList<>();
    for (JsonNode item : list) {
      names.add(item.get("name").asString());
    }
    return names;
  }

  private static List<String> groupIds(JsonNode board) {
    List<String> ids = new ArrayList<>();
    for (JsonNode group : board.get("groups")) {
      ids.add(group.get("groupId").asString());
    }
    return ids;
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
    String requestId = "req-" + UUID.randomUUID();
    return mvc.perform(request.header("X-Request-Id", requestId))
        .andExpect(status().is(httpStatus))
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.code").value(code))
        .andExpect(jsonPath("$.traceId").value(requestId))
        .andExpect(header().string("X-Request-Id", requestId));
  }

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

  /** A space with an ACTIVE event created by its owner, plus a form with the 또래 question. */
  private World world() throws Exception {
    UUID spaceId = UUID.randomUUID();
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, 'Home')", spaceId);
    UUID ownerId = user("Owner");
    member(spaceId, ownerId, "MEMBER");
    Cookie owner = login(ownerId);
    String created =
        mvc.perform(
                post("/api/v1/operator/spaces/" + spaceId + "/events")
                    .cookie(owner, csrf())
                    .header(CSRF_HEADER, CSRF)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"name\":\"수련회\"}"))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
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

  private void lifecycle(UUID eventId, String status) {
    jdbc.update("UPDATE events SET lifecycle_status = ? WHERE id = ?", status, eventId);
  }

  private void grant(World w, UUID userId, String permission) {
    jdbc.update(
        """
        INSERT INTO event_user_permissions (
          space_id, event_id, user_id, permission, effect, granted_by, granted_at)
        VALUES (?, ?, ?, ?, 'GRANT', ?, now())
        """,
        w.spaceId,
        w.eventId,
        userId,
        permission,
        w.ownerId);
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

  private static String boardPath(World w) {
    return "/api/v1/operator/events/" + w.eventId + "/group-board";
  }

  private static String groupsPath(World w) {
    return "/api/v1/operator/events/" + w.eventId + "/groups";
  }

  private static String groupPath(World w, String groupId) {
    return groupsPath(w) + "/" + groupId;
  }

  private int logCount(World w) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM group_assignment_logs WHERE event_id = ?", Integer.class, w.eventId);
  }

  private int assignmentRows(World w) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM group_assignments WHERE event_id = ?", Integer.class, w.eventId);
  }

  private int auditCount(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_logs WHERE event_id = ?", Integer.class, eventId);
  }

  private final class World {
    final UUID spaceId;
    final UUID eventId;
    final UUID formId;
    final UUID cohortField;
    final Cookie owner;
    final UUID ownerId;
    final Map<UUID, UUID> applications = new LinkedHashMap<>();

    World(UUID spaceId, UUID eventId, UUID formId, UUID cohortField, Cookie owner, UUID ownerId) {
      this.spaceId = spaceId;
      this.eventId = eventId;
      this.formId = formId;
      this.cohortField = cohortField;
      this.owner = owner;
      this.ownerId = ownerId;
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

    /** A generated question of the form with {@code key}. */
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

    void withdraw(UUID participantId) {
      jdbc.update(
          "UPDATE applications SET status = 'WITHDRAWN' WHERE participant_id = ?", participantId);
    }

    /** A participant with one SUBMITTED application. A null cohort stores no 또래 answer. */
    UUID participant(String name, String phone, String cohort) {
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
      if (cohort != null) {
        answer(id, cohortField, "{\"text\":\"" + cohort + "\"}");
      }
      return id;
    }
  }
}
