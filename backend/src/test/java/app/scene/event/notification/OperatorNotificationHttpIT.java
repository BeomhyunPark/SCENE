package app.scene.event.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.web.RequestIdFilter;
import app.scene.event.application.ParticipantApplicationService;
import app.scene.event.participant.ParticipantSelf;
import app.scene.support.PostgresTestcontainer;
import jakarta.servlet.http.Cookie;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers;
import org.springframework.session.web.http.SessionRepositoryFilter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Operator notifications about applications and the operator refresh check (DEC-080 §7.2, §7.5,
 * §10; I3 #436, A6 #437). Recipients are fixed when a revision is stored: active operators with an
 * effective {@code PARTICIPANT_READ}. The text carries the name and changed question titles only.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class OperatorNotificationHttpIT {

  private static final String OPERATOR_COOKIE = "SCENE_SESSION";
  private static final String PARTICIPANT_COOKIE = "SCENE_PSESSION";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";
  private static final String PIN = "730914";
  private static final String PHONE = "010-4321-8765";

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;
  @Autowired ParticipantApplicationService participantApplications;
  @Autowired TransactionTemplate transactions;

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
  void participantEditsReachReadersOnlyAndMergeIntoOneLine() throws Exception {
    World w = world();
    UUID manager = w.operator("Manager", "MANAGER");
    UUID staff = w.operator("Staff", "STAFF");
    UUID granted = w.operator("Granted staff", "STAFF");
    w.effect(granted, "PARTICIPANT_READ", "GRANT");
    UUID revoked = w.operator("Revoked manager", "MANAGER");
    w.effect(revoked, "PARTICIPANT_READ", "REVOKE");
    UUID removed = w.operator("Removed manager", "MANAGER");
    ok(write(delete(w.path("/operators/" + removed)), w.owner, "{}"));
    World other = world();
    UUID otherManager = other.operator("Other event manager", "MANAGER");

    Applied first = w.submit("김하나", "버스");
    assertThat(operatorRows(w.eventId)).isZero();

    String edited = w.edit(first.session, 1, "김하나", "자가용");
    UUID second = UUID.fromString(json.readTree(edited).get("applicationId").asString());
    assertThat(recipients(w.eventId, "APPLICATION_REVISED"))
        .containsExactlyInAnyOrder(w.ownerId, manager, granted);
    assertThat(recipients(w.eventId, "APPLICATION_REVISED"))
        .doesNotContain(staff, revoked, removed, otherManager);
    assertThat(operatorRows(other.eventId)).isZero();

    JsonNode item = list(w.owner, w.eventId).get("items").get(0);
    assertThat(item.get("kind").asString()).isEqualTo("APPLICATION_REVISED");
    assertThat(item.get("target").get("type").asString()).isEqualTo("APPLICATION");
    assertThat(item.get("target").get("id").asString()).isEqualTo(second.toString());
    assertThat(item.get("title").asString()).isEqualTo("김하나님이 신청 내역을 수정했어요");
    assertThat(item.get("body").asString()).isEqualTo("이동 수단");
    assertThat(item.get("count").asInt()).isEqualTo(1);
    assertThat(item.get("readAt").isNull()).isTrue();
    assertNoValues(item.toString());

    // A second edit merges: one row per recipient, count 2, pointing at the newest revision.
    String third = w.edit(first.session, 2, "김하나둘", "기차");
    UUID thirdId = UUID.fromString(json.readTree(third).get("applicationId").asString());
    assertThat(recipients(w.eventId, "APPLICATION_REVISED")).hasSize(3);
    JsonNode merged = list(w.owner, w.eventId).get("items");
    assertThat(merged).hasSize(1);
    assertThat(merged.get(0).get("count").asInt()).isEqualTo(2);
    assertThat(merged.get(0).get("target").get("id").asString()).isEqualTo(thirdId.toString());
    assertThat(merged.get(0).get("title").asString()).isEqualTo("김하나둘님이 신청 내역을 수정했어요");
    assertThat(merged.get(0).get("body").asString()).isEqualTo("이름, 이동 수단");
    assertNoValues(merged.toString());

    // Nothing changed: no revision and no notification.
    long seq = merged.get(0).get("seq").asLong();
    String same = w.edit(first.session, 3, "김하나둘", "기차");
    assertThat(json.readTree(same).get("revision").asInt()).isEqualTo(3);
    assertThat(list(w.owner, w.eventId).get("items").get(0).get("seq").asLong()).isEqualTo(seq);

    // A resubmit with the right number is its own kind; a wrong number (409) makes nothing.
    w.publicSubmit("김하나둘", "도보", "482915", 409);
    assertThat(recipients(w.eventId, "APPLICATION_RESUBMITTED")).isEmpty();
    String resubmitted = w.publicSubmit("김하나둘", "도보", PIN, 200);
    UUID fourth = UUID.fromString(json.readTree(resubmitted).get("applicationId").asString());
    assertThat(recipients(w.eventId, "APPLICATION_RESUBMITTED"))
        .containsExactlyInAnyOrder(w.ownerId, manager, granted);
    JsonNode both = list(w.owner, w.eventId).get("items");
    assertThat(both).hasSize(2);
    assertThat(both.get(0).get("kind").asString()).isEqualTo("APPLICATION_RESUBMITTED");
    assertThat(both.get(0).get("title").asString()).isEqualTo("김하나둘님이 다시 신청해 내용을 바꿨어요");
    // Both lines now open the current application.
    assertThat(both.get(0).get("target").get("id").asString()).isEqualTo(fourth.toString());
    assertThat(both.get(1).get("target").get("id").asString()).isEqualTo(fourth.toString());
    assertNoValues(both.toString());
    // The same answers again change nothing.
    w.publicSubmit("김하나둘", "도보", PIN, 200);
    assertThat(list(w.owner, w.eventId).get("items")).hasSize(2);

    // Every stored title and body is free of answers, phone and the six digits.
    for (String text :
        jdbc.queryForList(
            "SELECT title || ' ' || coalesce(body, '') FROM notifications WHERE event_id = ?",
            String.class,
            w.eventId)) {
      assertNoValues(text);
    }

    // updates carries the owner's own summary.
    JsonNode updates = updates(w.owner, w.eventId);
    assertThat(updates.get("notifications").get("unreadCount").asInt()).isEqualTo(2);
    assertThat(updates.get("notifications").get("latestSeq").asLong())
        .isEqualTo(both.get(0).get("seq").asLong());
    assertThat(updates.get("pollAfterSeconds").asInt()).isEqualTo(15);
    assertThat(updates.get("notices").asLong()).isZero();
    assertThat(updates.get("schedule").asLong()).isZero();
    assertThat(updates.get("checkIns").asLong()).isZero();
    assertThat(updates.get("serverTime").isString()).isTrue();
    assertThat(updates(w.login(staff), w.eventId).get("notifications").get("unreadCount").asInt())
        .isZero();

    // After the owner reads it, the next edit is a new line again.
    ok(
        write(
            post(w.path("/notifications/read")),
            w.owner,
            "{\"target\":{\"type\":\"APPLICATION\",\"id\":\"" + fourth + "\"}}"));
    assertThat(updates(w.owner, w.eventId).get("notifications").get("unreadCount").asInt())
        .isZero();
    w.edit(first.session, 4, "김하나둘", "택시");
    JsonNode fresh = list(w.owner, w.eventId).get("items");
    assertThat(fresh).hasSize(3);
    assertThat(fresh.get(0).get("count").asInt()).isEqualTo(1);
    assertThat(fresh.get(0).get("readAt").isNull()).isTrue();

    // D2: any notice write moves the operator-scope value, a STAFF notice reaches the other
    // operators.
    ok(
        write(
            post(w.path("/notices")),
            w.owner,
            "{\"title\":\"운영진 모임\",\"body\":\"7시\",\"audience\":[{\"type\":\"STAFF\"}],"
                + "\"publish\":true}"));
    assertThat(updates(w.owner, w.eventId).get("notices").asLong()).isPositive();
    assertThat(recipients(w.eventId, "STAFF_NOTICE_PUBLISHED"))
        .doesNotContain(w.ownerId)
        .contains(manager);
  }

  @Test
  void withdrawAndRestoreNotifyReadersButNotTheOperatorWhoDidIt() throws Exception {
    World w = world();
    UUID manager = w.operator("Manager", "MANAGER");
    UUID staff = w.operator("Staff", "STAFF");
    Cookie managerSession = w.login(manager);
    Applied applied = w.submit("오여섯", "버스");
    String edited = w.edit(applied.session, 1, "오여섯", "자가용");
    UUID current = UUID.fromString(json.readTree(edited).get("applicationId").asString());

    ok(
        write(
            post(w.path("/applications/" + current + "/withdraw")),
            managerSession,
            "{\"reason\":\"버스 사정으로 못 와요\"}"));
    assertThat(recipients(w.eventId, "APPLICATION_CANCELLED")).containsExactly(w.ownerId);
    JsonNode cancelled = list(w.owner, w.eventId).get("items").get(0);
    assertThat(cancelled.get("kind").asString()).isEqualTo("APPLICATION_CANCELLED");
    assertThat(cancelled.get("title").asString()).isEqualTo("오여섯님의 신청이 취소됐어요");
    assertThat(cancelled.get("important").asBoolean()).isTrue();
    assertThat(cancelled.get("target").get("id").asString()).isEqualTo(current.toString());
    assertThat(cancelled.toString()).doesNotContain("사정");
    assertNoValues(cancelled.toString());

    ok(write(post(w.path("/applications/" + current + "/restore")), w.owner, "{}"));
    assertThat(recipients(w.eventId, "APPLICATION_RESTORED")).containsExactly(manager);
    assertThat(recipients(w.eventId, "APPLICATION_RESTORED")).doesNotContain(staff, w.ownerId);

    // Withdrawn again, the participant comes back with changed answers: a new revision, and every
    // line about this person opens it.
    ok(write(post(w.path("/applications/" + current + "/withdraw")), managerSession, "{}"));
    String back = w.publicSubmit("오여섯", "기차", PIN, 200);
    UUID latest = UUID.fromString(json.readTree(back).get("applicationId").asString());
    assertThat(latest).isNotEqualTo(current);
    assertThat(recipients(w.eventId, "APPLICATION_RESTORED"))
        .containsExactlyInAnyOrder(manager, w.ownerId);
    for (JsonNode item : list(w.owner, w.eventId).get("items")) {
      assertThat(item.get("target").get("id").asString()).isEqualTo(latest.toString());
      assertNoValues(item.toString());
    }
  }

  @Test
  void anotherOperatorsIdChangesNothingAndAnswersTheSame() throws Exception {
    World w = world();
    UUID manager = w.operator("Manager", "MANAGER");
    Cookie managerSession = w.login(manager);
    Applied applied = w.submit("박둘", "버스");
    w.edit(applied.session, 1, "박둘", "자가용");
    String ownerNotification =
        list(w.owner, w.eventId).get("items").get(0).get("notificationId").asString();

    String byOthers =
        ok(
            write(
                post(w.path("/notifications/read")),
                managerSession,
                "{\"notificationIds\":[\"" + ownerNotification + "\"]}"));
    String byNothing =
        ok(
            write(
                post(w.path("/notifications/read")),
                w.login(w.operator("Third", "MANAGER")),
                "{\"notificationIds\":[\"" + UUID.randomUUID() + "\"]}"));
    assertThat(json.readTree(byOthers).get("unreadCount").asInt()).isEqualTo(1);
    assertThat(json.readTree(byNothing).get("unreadCount").asInt()).isEqualTo(0);
    assertThat(list(w.owner, w.eventId).get("items").get(0).get("readAt").isNull()).isTrue();
    // The manager's own list holds only the manager's row.
    JsonNode managerList = list(managerSession, w.eventId);
    assertThat(managerList.get("items")).hasSize(1);
    assertThat(managerList.get("items").get(0).get("notificationId").asString())
        .isNotEqualTo(ownerNotification);

    // Read everything up to the latest seq.
    long latest = updates(managerSession, w.eventId).get("notifications").get("latestSeq").asLong();
    String upTo =
        ok(
            write(
                post(w.path("/notifications/read")),
                managerSession,
                "{\"upToSeq\":" + latest + "}"));
    assertThat(json.readTree(upTo).get("unreadCount").asInt()).isZero();
    assertThat(list(w.owner, w.eventId).get("unreadCount").asInt()).isEqualTo(1);
  }

  @Test
  void onlyTheEventsActiveOperatorsOpenTheOperatorPaths() throws Exception {
    World w = world();
    Applied applied = w.submit("최셋", "버스");
    UUID removed = w.operator("Removed", "MANAGER");
    Cookie removedSession = w.login(removed);
    ok(write(delete(w.path("/operators/" + removed)), w.owner, "{}"));
    UUID member = w.user("Plain member");
    w.member(member, "MEMBER");
    World other = world();

    for (String suffix : List.of("/updates", "/notifications")) {
      problem(get(w.path(suffix)).cookie(removedSession), 403, "NOT_A_MEMBER");
      problem(get(w.path(suffix)).cookie(w.login(member)), 403, "NOT_A_MEMBER");
      problem(get(w.path(suffix)).cookie(other.owner), 404, "RESOURCE_NOT_FOUND");
      problem(
          get("/api/v1/operator/events/" + UUID.randomUUID() + suffix).cookie(w.owner),
          404,
          "RESOURCE_NOT_FOUND");
      // A participant session does not open an operator path.
      problem(get(w.path(suffix)).cookie(applied.session), 401, "AUTHENTICATION_REQUIRED");
      problem(get(w.path(suffix)), 401, "AUTHENTICATION_REQUIRED");
    }
    // POST needs CSRF.
    mvc.perform(
            post(w.path("/notifications/read"))
                .cookie(w.owner)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"upToSeq\":1}"))
        .andExpect(status().isForbidden());
    problem(
        write(
            post(w.path("/notifications/read")), w.owner, "{\"upToSeq\":1,\"notificationIds\":[]}"),
        400,
        "VALIDATION_FAILED");
    problem(get(w.path("/notifications?limit=0")).cookie(w.owner), 400, "VALIDATION_FAILED");
  }

  @Test
  void aFailedRevisionLeavesNoNotification() throws Exception {
    World w = world();
    Applied applied = w.submit("정넷", "버스");
    JsonNode body =
        json.readTree(
            w.answers("정넷", "자가용", null)
                .replace("{\"answers\"", "{\"expectedRevision\":1,\"answers\""));
    ParticipantSelf self =
        new ParticipantSelf(applied.participantId, w.eventId, w.spaceId, "정넷", false);

    transactions.executeWithoutResult(
        tx -> {
          participantApplications.edit(self, body);
          assertThat(operatorRows(w.eventId)).isEqualTo(1);
          tx.setRollbackOnly();
        });

    assertThat(operatorRows(w.eventId)).isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM applications WHERE participant_id = ?",
                Integer.class,
                applied.participantId))
        .isEqualTo(1);
  }

  @Test
  void tableMarksEditedRowsAndOldRevisionsKeepTheContactRule() throws Exception {
    World w = world();
    UUID staff = w.operator("Reader", "STAFF");
    Applied applied = w.submit("한다섯", "버스");
    String edited = w.edit(applied.session, 1, "한다섯", "자가용");
    UUID current = UUID.fromString(json.readTree(edited).get("applicationId").asString());

    JsonNode row =
        json.readTree(ok(get(w.path("/applications/table")).cookie(w.owner))).get("rows").get(0);
    assertThat(row.get("applicationId").asString()).isEqualTo(current.toString());
    assertThat(row.get("revision").asInt()).isEqualTo(2);
    assertThat(row.get("revisedBy").asString()).isEqualTo("PARTICIPANT");

    JsonNode revisions =
        json.readTree(ok(get(w.path("/applications/" + current + "/revisions")).cookie(w.owner)));
    assertThat(revisions.get("items")).hasSize(2);
    UUID old = UUID.fromString(revisions.get("items").get(1).get("applicationId").asString());
    assertThat(old).isEqualTo(applied.applicationId);

    // The old revision reads like any application: the owner sees the phone, a STAFF reader not.
    JsonNode ownerOld = json.readTree(ok(get(w.path("/applications/" + old)).cookie(w.owner)));
    assertThat(ownerOld.get("status").asString()).isEqualTo("SUPERSEDED");
    assertThat(phoneValue(ownerOld).get("text").asString()).isEqualTo(PHONE);
    assertThat(answerText(ownerOld, "이동 수단")).isEqualTo("버스");
    Cookie reader = w.login(staff);
    JsonNode staffOld = json.readTree(ok(get(w.path("/applications/" + old)).cookie(reader)));
    assertThat(staffOld.get("contactVisible").asBoolean()).isFalse();
    assertThat(phoneValue(staffOld).isNull()).isTrue();
    assertThat(staffOld.toString()).doesNotContain(PHONE);
    assertThat(answerText(staffOld, "이동 수단")).isEqualTo("버스");
    JsonNode staffNew = json.readTree(ok(get(w.path("/applications/" + current)).cookie(reader)));
    assertThat(phoneValue(staffNew).isNull()).isTrue();
    assertThat(answerText(staffNew, "이동 수단")).isEqualTo("자가용");
  }

  private static JsonNode phoneValue(JsonNode detail) {
    for (JsonNode answer : detail.get("answers")) {
      if ("PHONE".equals(answer.path("systemKey").asString())) {
        return answer.get("value");
      }
    }
    throw new AssertionError("no phone answer");
  }

  private static String answerText(JsonNode detail, String label) {
    for (JsonNode answer : detail.get("answers")) {
      if (label.equals(answer.get("label").asString())) {
        return answer.get("value").get("text").asString();
      }
    }
    throw new AssertionError("no answer " + label);
  }

  private static void assertNoValues(String text) {
    assertThat(text)
        .doesNotContain("버스", "자가용", "기차", "도보", "택시")
        .doesNotContain(PHONE, "01043218765", "8765")
        .doesNotContain(PIN, "482915");
  }

  private int operatorRows(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM notifications WHERE event_id = ? AND recipient_kind = 'OPERATOR'",
        Integer.class,
        eventId);
  }

  private List<UUID> recipients(UUID eventId, String kind) {
    return jdbc.query(
        "SELECT recipient_user_id FROM notifications WHERE event_id = ? AND kind = ?",
        (rs, i) -> rs.getObject(1, UUID.class),
        eventId,
        kind);
  }

  private JsonNode list(Cookie session, UUID eventId) throws Exception {
    return json.readTree(
        ok(get("/api/v1/operator/events/" + eventId + "/notifications").cookie(session)));
  }

  private JsonNode updates(Cookie session, UUID eventId) throws Exception {
    MvcResult result =
        mvc.perform(get("/api/v1/operator/events/" + eventId + "/updates").cookie(session))
            .andExpect(status().isOk())
            .andReturn();
    assertThat(result.getResponse().getHeader(HttpHeaders.CACHE_CONTROL)).contains("no-store");
    return json.readTree(result.getResponse().getContentAsString());
  }

  private String ok(MockHttpServletRequestBuilder request) throws Exception {
    return mvc.perform(request)
        .andExpect(status().is2xxSuccessful())
        .andReturn()
        .getResponse()
        .getContentAsString();
  }

  private void problem(MockHttpServletRequestBuilder request, int httpStatus, String code)
      throws Exception {
    mvc.perform(request)
        .andExpect(status().is(httpStatus))
        .andExpect(jsonPath("$.code").value(code));
  }

  private static MockHttpServletRequestBuilder write(
      MockHttpServletRequestBuilder request, Cookie session, String body) {
    Cookie csrf = new Cookie(CSRF_COOKIE, CSRF);
    if (session == null) {
      request.cookie(csrf);
    } else {
      request.cookie(session, csrf);
    }
    return request.header(CSRF_HEADER, CSRF).contentType(MediaType.APPLICATION_JSON).content(body);
  }

  private record Applied(UUID applicationId, UUID participantId, Cookie session) {}

  private final class World {
    final UUID spaceId;
    final UUID ownerId;
    final Cookie owner;
    UUID eventId;
    UUID formId;
    UUID nameId;
    UUID phoneId;
    UUID transportId;

    World(UUID spaceId, UUID ownerId, Cookie owner) {
      this.spaceId = spaceId;
      this.ownerId = ownerId;
      this.owner = owner;
    }

    String path(String suffix) {
      return "/api/v1/operator/events/" + eventId + suffix;
    }

    UUID user(String name) {
      UUID id = UUID.randomUUID();
      jdbc.update("INSERT INTO users (id, display_name) VALUES (?, ?)", id, name);
      return id;
    }

    void member(UUID userId, String role) {
      jdbc.update(
          "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, ?)", spaceId, userId, role);
    }

    UUID operator(String name, String role) {
      UUID id = user(name);
      member(id, "MEMBER");
      jdbc.update(
          "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, ?)",
          spaceId,
          eventId,
          id,
          role);
      return id;
    }

    void effect(UUID userId, String permission, String effect) {
      jdbc.update(
          """
          INSERT INTO event_user_permissions (
            space_id, event_id, user_id, permission, effect, granted_by, granted_at)
          VALUES (?, ?, ?, ?, ?, ?, now())
          """,
          spaceId,
          eventId,
          userId,
          permission,
          effect,
          ownerId);
    }

    Cookie login(UUID userId) throws Exception {
      Cookie cookie =
          mvc.perform(
                  write(
                      post("/api/v1/operator/auth/login"), null, "{\"userId\":\"" + userId + "\"}"))
              .andExpect(status().isOk())
              .andReturn()
              .getResponse()
              .getCookie(OPERATOR_COOKIE);
      assertThat(cookie).isNotNull();
      return cookie;
    }

    String answers(String name, String transport, String pin) {
      return "{"
          + (pin == null ? "" : "\"pin\":\"" + pin + "\",")
          + "\"answers\":["
          + answer(nameId, name)
          + ","
          + answer(phoneId, PHONE)
          + ","
          + answer(transportId, transport)
          + "]}";
    }

    private static String answer(UUID fieldId, String text) {
      return "{\"fieldId\":\"" + fieldId + "\",\"text\":\"" + text + "\"}";
    }

    Applied submit(String name, String transport) throws Exception {
      MvcResult result =
          mvc.perform(publicRequest(answers(name, transport, PIN)))
              .andExpect(status().isCreated())
              .andReturn();
      JsonNode body = json.readTree(result.getResponse().getContentAsString());
      return new Applied(
          UUID.fromString(body.get("applicationId").asString()),
          UUID.fromString(body.get("participantId").asString()),
          participantCookie(result));
    }

    String publicSubmit(String name, String transport, String pin, int expected) throws Exception {
      return mvc.perform(publicRequest(answers(name, transport, pin)))
          .andExpect(status().is(expected))
          .andReturn()
          .getResponse()
          .getContentAsString();
    }

    private MockHttpServletRequestBuilder publicRequest(String body) {
      return write(
          post("/api/v1/public/events/" + eventId + "/forms/" + formId + "/applications"),
          null,
          body);
    }

    String edit(Cookie session, int expectedRevision, String name, String transport)
        throws Exception {
      String body =
          answers(name, transport, null)
              .replace(
                  "{\"answers\"", "{\"expectedRevision\":" + expectedRevision + ",\"answers\"");
      return ok(write(put("/api/v1/participant/application"), session, body));
    }
  }

  private static Cookie participantCookie(MvcResult result) {
    String prefix = PARTICIPANT_COOKIE + "=";
    for (String header : result.getResponse().getHeaders(HttpHeaders.SET_COOKIE)) {
      if (header.startsWith(prefix)) {
        return new Cookie(
            PARTICIPANT_COOKIE, header.substring(prefix.length(), header.indexOf(';')));
      }
    }
    throw new AssertionError("no participant cookie");
  }

  /** An active event with an open form: 이름, 전화, (또래 hidden), 이동 수단. */
  private World world() throws Exception {
    UUID spaceId = UUID.randomUUID();
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, 'Home')", spaceId);
    UUID ownerId = UUID.randomUUID();
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, 'Owner')", ownerId);
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, 'OWNER')", spaceId, ownerId);
    World w = new World(spaceId, ownerId, null);
    Cookie owner = w.login(ownerId);
    w = new World(spaceId, ownerId, owner);
    JsonNode event =
        json.readTree(
            ok(
                write(
                    post("/api/v1/operator/spaces/" + spaceId + "/events"),
                    owner,
                    "{\"name\":\"수련회\"}")));
    w.eventId = UUID.fromString(event.get("eventId").asString());
    JsonNode form =
        json.readTree(ok(write(post(w.path("/forms")), owner, "{\"customLabel\":\"식사\"}")));
    w.formId = UUID.fromString(form.get("formId").asString());
    w.nameId = UUID.fromString(form.get("fields").get(0).get("fieldId").asString());
    w.phoneId = UUID.fromString(form.get("fields").get(1).get("fieldId").asString());
    ok(
        write(
            patch(
                w.path(
                    "/forms/"
                        + w.formId
                        + "/fields/"
                        + form.get("fields").get(2).get("fieldId").asString())),
            owner,
            "{\"hidden\":true}"));
    JsonNode withTransport =
        json.readTree(
            ok(
                write(
                    post(w.path("/forms/" + w.formId + "/fields")),
                    owner,
                    "{\"label\":\"이동 수단\"}")));
    List<String> labels = new ArrayList<>();
    for (JsonNode field : withTransport.get("fields")) {
      labels.add(field.get("label").asString());
      if ("이동 수단".equals(field.get("label").asString())) {
        w.transportId = UUID.fromString(field.get("fieldId").asString());
      }
    }
    assertThat(w.transportId).as(labels.toString()).isNotNull();
    ok(write(post(w.path("/activate")), owner, "{\"expectedLifecycleVersion\":0}"));
    ok(write(patch(w.path("/forms/" + w.formId)), owner, "{\"acceptingApplications\":true}"));
    return w;
  }
}
