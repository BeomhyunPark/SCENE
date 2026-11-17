package app.scene.event.checkin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
import java.util.Base64;
import java.util.List;
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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Operator check-in, cancel, roster, summary, and history (#282, DEC-071, api.md "체크인"). */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class CheckInHttpIT {

  private static final String OPERATOR_COOKIE = "SCENE_SESSION";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";
  private static final String KEY = "Idempotency-Key";
  private static final String BAD = "VALIDATION_FAILED";
  private static final String MISSING = "RESOURCE_NOT_FOUND";
  private static final String NAME = "홍길동비밀이름";
  private static final String PHONE = "010-9876-5432";

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;
  @Autowired CheckInCodes codes;

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
  void manualCheckInReplaysTheSameKeyAndReportsADuplicate() throws Exception {
    World w = world();
    UUID p = w.participant(NAME, PHONE, "94");
    UUID other = w.participant("다른 사람", "010-1111-2222", "95");
    int audits = auditCount(w.eventId);

    JsonNode first = json.readTree(ok(manual(w.owner, w.eventId, p, "k-1")));
    assertThat(first.propertyNames()).containsExactly("result", "participant", "checkIn");
    assertThat(first.get("result").asString()).isEqualTo("CHECKED_IN");
    assertThat(first.get("participant").propertyNames())
        .containsExactly("participantId", "name", "cohort");
    assertThat(first.get("participant").get("name").asString()).isEqualTo(NAME);
    assertThat(first.get("participant").get("cohort").asString()).isEqualTo("94");
    JsonNode checkIn = first.get("checkIn");
    assertThat(checkIn.propertyNames())
        .containsExactly(
            "checkInId",
            "participantId",
            "status",
            "method",
            "checkedInAt",
            "checkedInByUserId",
            "checkedInByDisplayName",
            "cancelledAt",
            "cancelledByUserId",
            "cancelledByDisplayName",
            "cancelReason");
    assertThat(checkIn.get("status").asString()).isEqualTo("CHECKED_IN");
    assertThat(checkIn.get("method").asString()).isEqualTo("MANUAL");
    assertThat(checkIn.get("checkedInByUserId").asString()).isEqualTo(w.ownerId.toString());
    assertThat(checkIn.get("checkedInByDisplayName").asString()).isEqualTo("Owner");
    assertThat(checkIn.get("cancelledAt").isNull()).isTrue();
    String checkInId = checkIn.get("checkInId").asString();
    assertThat(logCount(w.eventId)).isEqualTo(1);
    assertThat(auditCount(w.eventId)).isEqualTo(audits + 1);

    JsonNode replay = json.readTree(ok(manual(w.owner, w.eventId, p, "k-1")));
    assertThat(replay.get("result").asString()).isEqualTo("CHECKED_IN");
    assertThat(replay.get("checkIn").get("checkInId").asString()).isEqualTo(checkInId);
    assertThat(replay.get("checkIn").get("checkedInAt")).isEqualTo(checkIn.get("checkedInAt"));
    assertThat(logCount(w.eventId)).isEqualTo(1);
    assertThat(auditCount(w.eventId)).isEqualTo(audits + 1);

    problem(manual(w.owner, w.eventId, other, "k-1"), 409, "CONFLICT");
    assertThat(checkInRows(w.eventId)).isEqualTo(1);

    UUID staffId = w.operator("Staff", "STAFF");
    JsonNode duplicate = json.readTree(ok(manual(login(staffId), w.eventId, p, "k-2")));
    assertThat(duplicate.get("result").asString()).isEqualTo("ALREADY_CHECKED_IN");
    assertThat(duplicate.get("checkIn").get("checkInId").asString()).isEqualTo(checkInId);
    assertThat(duplicate.get("checkIn").get("checkedInByDisplayName").asString())
        .isEqualTo("Owner");
    assertThat(logCount(w.eventId)).isEqualTo(1);
    assertThat(auditCount(w.eventId)).isEqualTo(audits + 1);
    assertThat(keyCount(w.eventId, "k-2")).isZero();
  }

  @Test
  void cancelKeepsHistoryAndCheckInAgainReusesTheRow() throws Exception {
    World w = world();
    UUID p = w.participant(NAME, PHONE, "94");
    String checkInId =
        json.readTree(ok(manual(w.owner, w.eventId, p, "in-1")))
            .get("checkIn")
            .get("checkInId")
            .asString();
    int audits = auditCount(w.eventId);

    JsonNode cancelled =
        json.readTree(
            ok(cancel(w.owner, w.eventId, checkInId, "c-1", "{\"reason\":\"  잘못 찍음 \"}")));
    assertThat(cancelled.propertyNames()).containsExactly("result", "checkIn");
    assertThat(cancelled.get("result").asString()).isEqualTo("CANCELLED");
    JsonNode row = cancelled.get("checkIn");
    assertThat(row.get("status").asString()).isEqualTo("CANCELLED");
    assertThat(row.get("cancelReason").asString()).isEqualTo("잘못 찍음");
    assertThat(row.get("cancelledByDisplayName").asString()).isEqualTo("Owner");
    assertThat(row.get("cancelledAt").isNull()).isFalse();
    assertThat(auditCount(w.eventId)).isEqualTo(audits + 1);

    JsonNode replay = json.readTree(ok(cancel(w.owner, w.eventId, checkInId, "c-1", null)));
    assertThat(replay.get("result").asString()).isEqualTo("CANCELLED");
    JsonNode again = json.readTree(ok(cancel(w.owner, w.eventId, checkInId, "c-2", null)));
    assertThat(again.get("result").asString()).isEqualTo("ALREADY_CANCELLED");
    assertThat(auditCount(w.eventId)).isEqualTo(audits + 1);
    problem(cancel(w.owner, w.eventId, checkInId, "in-1", null), 409, "CONFLICT");
    problem(manual(w.owner, w.eventId, p, "c-1"), 409, "CONFLICT");

    JsonNode back = json.readTree(ok(manual(w.owner, w.eventId, p, "in-2")));
    assertThat(back.get("result").asString()).isEqualTo("CHECKED_IN");
    JsonNode reused = back.get("checkIn");
    assertThat(reused.get("checkInId").asString()).isEqualTo(checkInId);
    assertThat(reused.get("status").asString()).isEqualTo("CHECKED_IN");
    assertThat(reused.get("cancelledAt").isNull()).isTrue();
    assertThat(reused.get("cancelledByUserId").isNull()).isTrue();
    assertThat(reused.get("cancelReason").isNull()).isTrue();
    assertThat(checkInRows(w.eventId)).isEqualTo(1);
    assertThat(auditCount(w.eventId)).isEqualTo(audits + 2);

    JsonNode logs = json.readTree(ok(get(logsPath(w.eventId, p)).cookie(w.owner)));
    assertThat(logs.get("page").get("totalItems").asLong()).isEqualTo(3);
    JsonNode items = logs.get("items");
    assertThat(items.get(0).propertyNames())
        .containsExactly(
            "logId",
            "checkInId",
            "action",
            "method",
            "actorUserId",
            "actorDisplayName",
            "reason",
            "createdAt");
    assertThat(items.get(0).get("action").asString()).isEqualTo("CHECKED_IN");
    assertThat(items.get(1).get("action").asString()).isEqualTo("CANCELLED");
    assertThat(items.get(1).get("method").isNull()).isTrue();
    assertThat(items.get(1).get("reason").asString()).isEqualTo("잘못 찍음");
    assertThat(items.get(2).get("action").asString()).isEqualTo("CHECKED_IN");
    assertThat(items.get(2).get("method").asString()).isEqualTo("MANUAL");
    assertThat(items.get(2).get("actorDisplayName").asString()).isEqualTo("Owner");

    List<String> actions = auditActions(w.eventId);
    assertThat(actions).containsExactly("CHECKIN_CREATED", "CHECKIN_CANCELLED", "CHECKIN_CREATED");
    JsonNode cancelAudit = json.readTree(auditDetails(w.eventId).get(1));
    assertThat(cancelAudit.propertyNames())
        .containsExactlyInAnyOrder("checkInId", "participantId", "method", "reason");
    assertThat(cancelAudit.get("method").isNull()).isTrue();
    assertThat(cancelAudit.get("reason").asString()).isEqualTo("잘못 찍음");
    JsonNode createAudit = json.readTree(auditDetails(w.eventId).get(0));
    assertThat(createAudit.get("method").asString()).isEqualTo("MANUAL");
    assertThat(createAudit.get("reason").isNull()).isTrue();
    assertThat(createAudit.get("participantId").asString()).isEqualTo(p.toString());
  }

  @Test
  void qrValueChecksInAndEveryWrongValueIsNotFound() throws Exception {
    World w = world();
    UUID p = w.participant(NAME, PHONE, "94");
    String code = codes.issue(w.eventId, p).orElseThrow();
    assertThat(code).startsWith("SCENE-CI1.").doesNotContain("=");
    assertThat(codes.issue(w.eventId, p)).contains(code);

    World elsewhere = world();
    UUID stranger = elsewhere.participant("남", "010-3333-4444", "90");
    String otherEventCode = codes.issue(elsewhere.eventId, stranger).orElseThrow();
    String forgedForP = codes.issue(elsewhere.eventId, p).orElseThrow();
    byte[] raw = Base64.getUrlDecoder().decode(code.substring("SCENE-CI1.".length()));
    raw[31] ^= 1;
    String tampered = "SCENE-CI1." + Base64.getUrlEncoder().withoutPadding().encodeToString(raw);

    for (String wrong :
        List.of(
            otherEventCode,
            forgedForP,
            tampered,
            code + "=",
            "SCENE-CI1.###",
            "SCENE-CI1.AAAA",
            "SCENE-CI2." + code.substring(10),
            p.toString())) {
      problem(qr(w.owner, w.eventId, wrong, "q-" + UUID.randomUUID()), 404, MISSING);
    }
    assertThat(logCount(w.eventId)).isZero();

    JsonNode scanned = json.readTree(ok(qr(w.owner, w.eventId, code, "q-ok")));
    assertThat(scanned.get("result").asString()).isEqualTo("CHECKED_IN");
    assertThat(scanned.get("participant").get("participantId").asString()).isEqualTo(p.toString());
    assertThat(scanned.get("checkIn").get("method").asString()).isEqualTo("QR");
    JsonNode rescanned = json.readTree(ok(qr(w.owner, w.eventId, code, "q-again")));
    assertThat(rescanned.get("result").asString()).isEqualTo("ALREADY_CHECKED_IN");
    assertThat(auditDetails(w.eventId).toString()).doesNotContain(code);
  }

  @Test
  void twoOperatorsCheckingInAtOnceGetOneCheckIn() throws Exception {
    World w = world();
    UUID p = w.participant(NAME, PHONE, "94");
    Cookie staff = login(w.operator("Staff", "STAFF"));
    Cookie manager = login(w.operator("Manager", "MANAGER"));
    CountDownLatch start = new CountDownLatch(1);
    ExecutorService pool = Executors.newFixedThreadPool(2);
    try {
      List<Future<String>> results = new ArrayList<>();
      for (Callable<String> call :
          List.<Callable<String>>of(
              () -> {
                start.await();
                return ok(manual(staff, w.eventId, p, "race-a"));
              },
              () -> {
                start.await();
                return ok(manual(manager, w.eventId, p, "race-b"));
              })) {
        results.add(pool.submit(call));
      }
      start.countDown();
      List<String> outcomes = new ArrayList<>();
      for (Future<String> result : results) {
        outcomes.add(json.readTree(result.get(30, TimeUnit.SECONDS)).get("result").asString());
      }
      assertThat(outcomes).containsExactlyInAnyOrder("CHECKED_IN", "ALREADY_CHECKED_IN");
    } finally {
      pool.shutdownNow();
    }
    assertThat(checkInRows(w.eventId)).isEqualTo(1);
    assertThat(logCount(w.eventId)).isEqualTo(1);
    assertThat(auditActions(w.eventId)).containsExactly("CHECKIN_CREATED");
  }

  @Test
  void permissionsFollowDefaultsAndPhoneLast4NeedsCheckInWrite() throws Exception {
    World w = world();
    UUID p = w.participant(NAME, PHONE, "94");
    w.participant("김일이", "010-0000-9999", null);

    UUID staffId = w.operator("Staff", "STAFF");
    JsonNode byStaff = json.readTree(ok(manual(login(staffId), w.eventId, p, "s-1")));
    assertThat(byStaff.get("result").asString()).isEqualTo("CHECKED_IN");
    String checkInId = byStaff.get("checkIn").get("checkInId").asString();
    UUID managerId = w.operator("Manager", "MANAGER");
    JsonNode byManager =
        json.readTree(ok(cancel(login(managerId), w.eventId, checkInId, "m-1", null)));
    assertThat(byManager.get("result").asString()).isEqualTo("CANCELLED");

    UUID revokedId = w.operator("Revoked", "STAFF");
    revoke(w, revokedId, "CHECKIN_WRITE");
    Cookie revoked = login(revokedId);
    problem(manual(revoked, w.eventId, p, "r-1"), 403, "FORBIDDEN");
    problem(cancel(revoked, w.eventId, checkInId, "r-2", null), 403, "FORBIDDEN");
    problem(get(logsPath(w.eventId, p)).cookie(revoked), 403, "FORBIDDEN");
    JsonNode hidden = json.readTree(ok(get(rosterPath(w.eventId)).cookie(revoked)));
    for (JsonNode item : hidden.get("items")) {
      assertThat(item.get("phoneLast4").isNull()).isTrue();
    }
    JsonNode digitsAsName =
        json.readTree(ok(get(rosterPath(w.eventId)).param("q", "5432").cookie(revoked)));
    assertThat(digitsAsName.get("items").size()).isZero();
    ok(get(summaryPath(w.eventId)).cookie(revoked));

    JsonNode shown = json.readTree(ok(get(rosterPath(w.eventId)).cookie(login(staffId))));
    assertThat(shown.get("items").get(0).propertyNames())
        .containsExactly(
            "participantId", "applicationId", "name", "cohort", "phoneLast4", "checkIn");
    for (JsonNode item : shown.get("items")) {
      assertThat(item.get("applicationId").asString())
          .isEqualTo(
              jdbc.queryForObject(
                  "SELECT id::text FROM applications WHERE participant_id = ?::uuid",
                  String.class,
                  item.get("participantId").asString()));
    }
    JsonNode byDigits =
        json.readTree(ok(get(rosterPath(w.eventId)).param("q", " 5432 ").cookie(login(staffId))));
    assertThat(byDigits.get("items").size()).isEqualTo(1);
    assertThat(byDigits.get("items").get(0).get("phoneLast4").asString()).isEqualTo("5432");
    assertThat(byDigits.toString()).doesNotContain(PHONE);

    UUID adminId = user("Admin");
    member(w.spaceId, adminId, "ADMIN");
    Cookie admin = login(adminId);
    JsonNode asAdmin = json.readTree(ok(get(rosterPath(w.eventId)).cookie(admin)));
    assertThat(asAdmin.get("items").get(0).get("phoneLast4").isNull()).isTrue();
    problem(manual(admin, w.eventId, p, "a-1"), 403, "FORBIDDEN");

    UUID memberId = user("Member");
    member(w.spaceId, memberId, "MEMBER");
    problem(get(summaryPath(w.eventId)).cookie(login(memberId)), 403, "FORBIDDEN");

    World elsewhere = world();
    problem(get(summaryPath(w.eventId)).cookie(elsewhere.owner), 404, MISSING);
    problem(manual(elsewhere.owner, w.eventId, p, "x-1"), 404, MISSING);
    problem(get(rosterPath(w.eventId)).cookie(elsewhere.owner), 404, MISSING);
    UUID foreign = elsewhere.participant("남", "010-3333-4444", "90");
    problem(manual(w.owner, w.eventId, foreign, "x-2"), 404, MISSING);
    problem(get(logsPath(w.eventId, foreign)).cookie(w.owner), 404, MISSING);
    problem(cancel(w.owner, elsewhere.eventId, checkInId, "x-3", null), 404, MISSING);
    problem(cancel(w.owner, w.eventId, UUID.randomUUID().toString(), "x-4", null), 404, MISSING);
  }

  @Test
  void writesFollowTheEventStateAndReadsStayOpen() throws Exception {
    World w = world();
    UUID p = w.participant(NAME, PHONE, "94");
    String checkInId =
        json.readTree(ok(manual(w.owner, w.eventId, p, "st-0")))
            .get("checkIn")
            .get("checkInId")
            .asString();

    lifecycle(w.eventId, "DRAFT");
    problem(manual(w.owner, w.eventId, p, "st-1"), 409, "INVALID_STATE_TRANSITION")
        .andExpect(jsonPath("$.eventStatus").value("DRAFT"));
    problem(cancel(w.owner, w.eventId, checkInId, "st-2", null), 409, "INVALID_STATE_TRANSITION");

    lifecycle(w.eventId, "ENDED");
    problem(manual(w.owner, w.eventId, p, "st-3"), 409, "EVENT_ENDED")
        .andExpect(jsonPath("$.detail").value("종료된 행사에서는 이 작업을 할 수 없습니다."));
    problem(cancel(w.owner, w.eventId, checkInId, "st-4", null), 409, "EVENT_ENDED");
    problem(manual(w.owner, w.eventId, p, "st-0"), 409, "EVENT_ENDED");

    lifecycle(w.eventId, "ARCHIVED");
    problem(manual(w.owner, w.eventId, p, "st-5"), 409, "EVENT_ARCHIVED");
    problem(cancel(w.owner, w.eventId, checkInId, "st-6", null), 409, "EVENT_ARCHIVED");

    JsonNode summary = json.readTree(ok(get(summaryPath(w.eventId)).cookie(w.owner)));
    assertThat(summary.get("eventStatus").asString()).isEqualTo("ARCHIVED");
    assertThat(summary.get("checkedIn").asLong()).isEqualTo(1);
    ok(get(rosterPath(w.eventId)).cookie(w.owner));
    ok(get(logsPath(w.eventId, p)).cookie(w.owner));
    assertThat(logCount(w.eventId)).isEqualTo(1);
  }

  @Test
  void summaryAndRosterCountSubmittedParticipantsAndBlockWithdrawn() throws Exception {
    World w = world();
    UUID first = w.participant("가나다", "010-1000-0001", "94");
    UUID second = w.participant("나다라", "010-1000-0002", "95");
    UUID third = w.participant("ABC Kim", "010-1000-0003", "96");
    UUID withdrawn = w.participant("철회자", "010-1000-0004", "97");
    jdbc.update("UPDATE applications SET status = 'WITHDRAWN' WHERE participant_id = ?", withdrawn);

    problem(manual(w.owner, w.eventId, withdrawn, "w-1"), 409, "INVALID_STATE_TRANSITION")
        .andExpect(jsonPath("$.reason").value("APPLICATION_NOT_SUBMITTED"));
    String checkInId =
        json.readTree(ok(manual(w.owner, w.eventId, first, "w-2")))
            .get("checkIn")
            .get("checkInId")
            .asString();
    ok(manual(w.owner, w.eventId, second, "w-3"));
    ok(cancel(w.owner, w.eventId, checkInId, "w-4", "{}"));

    JsonNode summary = json.readTree(ok(get(summaryPath(w.eventId)).cookie(w.owner)));
    assertThat(summary.propertyNames())
        .containsExactly("eventStatus", "total", "checkedIn", "notCheckedIn");
    assertThat(summary.get("eventStatus").asString()).isEqualTo("ACTIVE");
    assertThat(summary.get("total").asLong()).isEqualTo(3);
    assertThat(summary.get("checkedIn").asLong()).isEqualTo(1);
    assertThat(summary.get("notCheckedIn").asLong()).isEqualTo(2);

    JsonNode roster = json.readTree(ok(get(rosterPath(w.eventId)).cookie(w.owner)));
    assertThat(names(roster)).containsExactlyInAnyOrder("ABC Kim", "가나다", "나다라");
    JsonNode never = item(roster, third);
    assertThat(never.get("checkIn").isNull()).isTrue();
    assertThat(item(roster, first).get("checkIn").get("status").asString()).isEqualTo("CANCELLED");
    JsonNode brief = item(roster, second).get("checkIn");
    assertThat(brief.propertyNames())
        .containsExactly("checkInId", "status", "method", "checkedInAt", "checkedInByDisplayName");
    assertThat(brief.get("checkedInByDisplayName").asString()).isEqualTo("Owner");
    assertThat(item(roster, second).get("cohort").asString()).isEqualTo("95");

    assertThat(names(roster(w, "q", "다"))).containsExactly("가나다", "나다라");
    assertThat(names(roster(w, "q", "abc"))).containsExactly("ABC Kim");
    assertThat(names(roster(w, "q", "0003"))).containsExactly("ABC Kim");
    assertThat(names(roster(w, "q", "%"))).isEmpty();
    assertThat(names(roster(w, "checkedIn", "true"))).containsExactly("나다라");
    assertThat(names(roster(w, "checkedIn", "false"))).containsExactlyInAnyOrder("ABC Kim", "가나다");
    JsonNode paged =
        json.readTree(
            ok(get(rosterPath(w.eventId)).param("size", "2").param("page", "1").cookie(w.owner)));
    assertThat(names(paged)).containsExactly(names(roster).get(2));
    assertThat(paged.get("page").get("totalItems").asLong()).isEqualTo(3);

    jdbc.update(
        "UPDATE fields SET hidden = true WHERE event_id = ? AND system_key = 'COHORT'", w.eventId);
    JsonNode hiddenCohort = roster(w, "q", "나다라");
    assertThat(hiddenCohort.get("items").get(0).get("cohort").isNull()).isTrue();
  }

  @Test
  void requestsAreValidatedAfterPermissionAndBeforeState() throws Exception {
    World w = world();
    UUID p = w.participant(NAME, PHONE, "94");
    String path = checkInsPath(w.eventId);
    String manualBody = "{\"mode\":\"MANUAL\",\"participantId\":\"" + p + "\"}";

    problem(write(post(path), w.owner, null, manualBody), 400, BAD)
        .andExpect(jsonPath("$.errors[0].field").value(KEY));
    problem(write(post(path), w.owner, "", manualBody), 400, BAD)
        .andExpect(jsonPath("$.errors[0].field").value(KEY));
    problem(write(post(path), w.owner, "k".repeat(101), manualBody), 400, BAD)
        .andExpect(jsonPath("$.errors[0].field").value(KEY));
    ok(write(post(path), w.owner, "k".repeat(100), manualBody));

    problem(write(post(path), w.owner, "v-1", "{}"), 400, BAD)
        .andExpect(jsonPath("$.errors[0].field").value("mode"));
    problem(write(post(path), w.owner, "v-2", "{\"mode\":\"FACE\"}"), 400, BAD)
        .andExpect(jsonPath("$.errors[0].field").value("mode"));
    problem(write(post(path), w.owner, "v-3", "{\"mode\":\"QR\"}"), 400, BAD)
        .andExpect(jsonPath("$.errors[0].field").value("code"));
    problem(write(post(path), w.owner, "v-4", "{\"mode\":\"MANUAL\"}"), 400, BAD)
        .andExpect(jsonPath("$.errors[0].field").value("participantId"));
    problem(
            write(post(path), w.owner, "v-5", "{\"mode\":\"MANUAL\",\"participantId\":\"x\"}"),
            400,
            BAD)
        .andExpect(jsonPath("$.errors[0].field").value("participantId"));
    problem(manual(w.owner, w.eventId, UUID.randomUUID(), "v-6"), 404, MISSING);

    String checkInId =
        json.readTree(ok(manual(w.owner, w.eventId, p, "v-7")))
            .get("checkIn")
            .get("checkInId")
            .asString();
    String tooLong = "{\"reason\":\"" + "가".repeat(201) + "\"}";
    problem(cancel(w.owner, w.eventId, checkInId, "v-8", tooLong), 400, BAD)
        .andExpect(jsonPath("$.errors[0].field").value("reason"));
    problem(cancel(w.owner, w.eventId, checkInId, null, null), 400, BAD)
        .andExpect(jsonPath("$.errors[0].field").value(KEY));
    String atMax = "{\"reason\":\"" + "가".repeat(200) + "\"}";
    ok(cancel(w.owner, w.eventId, checkInId, "v-9", atMax));

    lifecycle(w.eventId, "ENDED");
    problem(write(post(path), w.owner, null, manualBody), 400, BAD);
    UUID revokedId = w.operator("Revoked", "STAFF");
    revoke(w, revokedId, "CHECKIN_WRITE");
    problem(write(post(path), login(revokedId), null, "{}"), 403, "FORBIDDEN");

    problem(get(rosterPath(w.eventId)).param("q", "  ").cookie(w.owner), 400, BAD)
        .andExpect(jsonPath("$.errors[0].field").value("q"));
    problem(get(rosterPath(w.eventId)).param("q", "가".repeat(51)).cookie(w.owner), 400, BAD);
    problem(get(rosterPath(w.eventId)).param("checkedIn", "yes").cookie(w.owner), 400, BAD)
        .andExpect(jsonPath("$.errors[0].field").value("checkedIn"));
    problem(
            get("/api/v1/operator/events/" + w.eventId + "/check-in-logs").cookie(w.owner),
            400,
            BAD)
        .andExpect(jsonPath("$.errors[0].field").value("participantId"));
  }

  @Test
  void auditAndApplicationLogsCarryNoNameOrPhone() throws Exception {
    ListAppender<ILoggingEvent> logs = new ListAppender<>();
    logs.start();
    Logger app = (Logger) LoggerFactory.getLogger("app.scene");
    app.addAppender(logs);
    try {
      World w = world();
      UUID p = w.participant(NAME, PHONE, "94");
      String code = codes.issue(w.eventId, p).orElseThrow();
      String checkInId =
          json.readTree(ok(qr(w.owner, w.eventId, code, "pii-1")))
              .get("checkIn")
              .get("checkInId")
              .asString();
      ok(cancel(w.owner, w.eventId, checkInId, "pii-2", null));
      ok(manual(w.owner, w.eventId, p, "pii-3"));
      problem(qr(w.owner, w.eventId, code + "x", "pii-4"), 404, MISSING);

      String audit = String.join("\n", auditDetails(w.eventId));
      assertThat(audit).doesNotContain(NAME).doesNotContain(PHONE).doesNotContain("5432");
      assertThat(audit).doesNotContain(code);
      String history =
          String.join(
              "\n",
              jdbc.queryForList(
                  "SELECT row_to_json(l)::text FROM checkin_logs l WHERE event_id = ?",
                  String.class,
                  w.eventId));
      assertThat(history).doesNotContain(NAME).doesNotContain(PHONE).doesNotContain(code);
      for (ILoggingEvent logged : logs.list) {
        assertThat(logged.getFormattedMessage())
            .doesNotContain(NAME)
            .doesNotContain(PHONE)
            .doesNotContain(code);
      }
    } finally {
      app.detachAppender(logs);
    }
  }

  private JsonNode roster(World w, String param, String value) throws Exception {
    return json.readTree(ok(get(rosterPath(w.eventId)).param(param, value).cookie(w.owner)));
  }

  private static JsonNode item(JsonNode page, UUID participantId) {
    for (JsonNode item : page.get("items")) {
      if (item.get("participantId").asString().equals(participantId.toString())) {
        return item;
      }
    }
    throw new AssertionError("participant is not on the roster page");
  }

  private static List<String> names(JsonNode page) {
    List<String> names = new ArrayList<>();
    for (JsonNode item : page.get("items")) {
      names.add(item.get("name").asString());
    }
    return names;
  }

  private MockHttpServletRequestBuilder manual(
      Cookie session, UUID eventId, UUID participantId, String key) {
    return write(
        post(checkInsPath(eventId)),
        session,
        key,
        "{\"mode\":\"MANUAL\",\"participantId\":\"" + participantId + "\"}");
  }

  private MockHttpServletRequestBuilder qr(Cookie session, UUID eventId, String code, String key) {
    return write(
        post(checkInsPath(eventId)),
        session,
        key,
        json.writeValueAsString(java.util.Map.of("mode", "QR", "code", code)));
  }

  private MockHttpServletRequestBuilder cancel(
      Cookie session, UUID eventId, String checkInId, String key, String body) {
    return write(post(checkInsPath(eventId) + "/" + checkInId + "/cancel"), session, key, body);
  }

  private static MockHttpServletRequestBuilder write(
      MockHttpServletRequestBuilder request, Cookie session, String key, String body) {
    request.cookie(session, csrf()).header(CSRF_HEADER, CSRF);
    if (key != null) {
      request.header(KEY, key);
    }
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

  private void revoke(World w, UUID userId, String permission) {
    jdbc.update(
        """
        INSERT INTO event_user_permissions (
          space_id, event_id, user_id, permission, effect, granted_by, granted_at)
        VALUES (?, ?, ?, ?, 'REVOKE', ?, now())
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

  private static String checkInsPath(UUID eventId) {
    return "/api/v1/operator/events/" + eventId + "/check-ins";
  }

  private static String summaryPath(UUID eventId) {
    return checkInsPath(eventId) + "/summary";
  }

  private static String rosterPath(UUID eventId) {
    return "/api/v1/operator/events/" + eventId + "/check-in-roster";
  }

  private static String logsPath(UUID eventId, UUID participantId) {
    return "/api/v1/operator/events/" + eventId + "/check-in-logs?participantId=" + participantId;
  }

  private int logCount(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM checkin_logs WHERE event_id = ?", Integer.class, eventId);
  }

  private int keyCount(UUID eventId, String key) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM checkin_logs WHERE event_id = ? AND idempotency_key = ?",
        Integer.class,
        eventId,
        key);
  }

  private int checkInRows(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM checkins WHERE event_id = ?", Integer.class, eventId);
  }

  private int auditCount(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_logs WHERE event_id = ?", Integer.class, eventId);
  }

  private List<String> auditActions(UUID eventId) {
    return jdbc.queryForList(
        """
        SELECT action FROM audit_logs
        WHERE event_id = ? AND action LIKE 'CHECKIN_%' ORDER BY occurred_at, action DESC
        """,
        String.class, eventId);
  }

  private List<String> auditDetails(UUID eventId) {
    return jdbc.queryForList(
        """
        SELECT detail::text FROM audit_logs
        WHERE event_id = ? AND action LIKE 'CHECKIN_%' ORDER BY occurred_at, action DESC
        """,
        String.class, eventId);
  }

  private final class World {
    final UUID spaceId;
    final UUID eventId;
    final UUID formId;
    final UUID cohortField;
    final Cookie owner;
    final UUID ownerId;

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
      if (cohort != null) {
        jdbc.update(
            """
            INSERT INTO answers (id, space_id, event_id, application_id, field_id, value)
            VALUES (?, ?, ?, ?, ?, jsonb_build_object('text', ?::text))
            """,
            UUID.randomUUID(),
            spaceId,
            eventId,
            applicationId,
            cohortField,
            cohort);
      }
      return id;
    }
  }
}
