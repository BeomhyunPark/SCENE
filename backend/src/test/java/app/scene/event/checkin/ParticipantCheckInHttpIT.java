package app.scene.event.checkin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.web.RequestIdFilter;
import app.scene.event.lifecycle.EventRepository;
import app.scene.event.participant.Digests;
import app.scene.event.participant.ParticipantSelf;
import app.scene.support.PostgresTestcontainer;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import jakarta.servlet.http.Cookie;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers;
import org.springframework.session.web.http.SessionRepositoryFilter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Participant check-in QR value (#283, DEC-071, api.md "GET /api/v1/participant/check-in"). */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class ParticipantCheckInHttpIT {

  private static final String PATH = "/api/v1/participant/check-in";
  private static final String OPERATOR_COOKIE = "SCENE_SESSION";
  private static final String PARTICIPANT_COOKIE = "SCENE_PSESSION";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";
  private static final String NAME = "홍길동비밀이름";
  private static final String PHONE = "010-9876-5432";

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;
  @Autowired EventRepository events;
  @Autowired CheckInRepository checkIns;

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
  void sameParticipantGetsTheSameValueAndOperatorQrChecksItIn() throws Exception {
    World w = world();
    Held p = w.participant(NAME, PHONE);
    int audits = auditCount(w.eventId);

    String first = read(p.session);
    JsonNode body = json.readTree(first);
    assertThat(body.propertyNames()).containsExactly("status", "code", "checkedIn", "checkedInAt");
    assertThat(body.get("status").asString()).isEqualTo("AVAILABLE");
    assertThat(body.get("checkedIn").asBoolean()).isFalse();
    assertThat(body.get("checkedInAt").isNull()).isTrue();
    String code = body.get("code").asString();
    assertThat(code).startsWith("SCENE-CI1.").doesNotContain("=");
    assertThat(code)
        .doesNotContain(NAME)
        .doesNotContain(PHONE)
        .doesNotContain("5432")
        .doesNotContain(p.accessKey)
        .doesNotContain(p.token);
    assertThat(first).doesNotContain(NAME).doesNotContain(PHONE).doesNotContain(p.accessKey);

    assertThat(json.readTree(read(p.session)).get("code").asString()).isEqualTo(code);
    Cookie again = w.session(p.accessKey);
    assertThat(again.getValue()).isNotEqualTo(p.token);
    assertThat(json.readTree(read(again)).get("code").asString()).isEqualTo(code);
    assertThat(auditCount(w.eventId)).isEqualTo(audits);
    assertThat(checkInRows(w.eventId)).isZero();

    Held other = w.participant("다른 사람", "010-1111-2222");
    assertThat(json.readTree(read(other.session)).get("code").asString()).isNotEqualTo(code);

    JsonNode scanned = json.readTree(qr(w, code, "qr-1"));
    assertThat(scanned.get("result").asString()).isEqualTo("CHECKED_IN");
    assertThat(scanned.get("participant").get("participantId").asString())
        .isEqualTo(p.participantId.toString());
    assertThat(scanned.get("checkIn").get("method").asString()).isEqualTo("QR");

    JsonNode after = json.readTree(read(p.session));
    assertThat(after.get("status").asString()).isEqualTo("AVAILABLE");
    assertThat(after.get("code").asString()).isEqualTo(code);
    assertThat(after.get("checkedIn").asBoolean()).isTrue();
    assertThat(after.get("checkedInAt").asString())
        .isEqualTo(scanned.get("checkIn").get("checkedInAt").asString());

    String checkInId = scanned.get("checkIn").get("checkInId").asString();
    mvc.perform(
            post("/api/v1/operator/events/" + w.eventId + "/check-ins/" + checkInId + "/cancel")
                .cookie(w.owner, csrf())
                .header(CSRF_HEADER, CSRF)
                .header("Idempotency-Key", "cancel-1"))
        .andExpect(status().isOk());
    JsonNode cancelled = json.readTree(read(p.session));
    assertThat(cancelled.get("checkedIn").asBoolean()).isFalse();
    assertThat(cancelled.get("checkedInAt").isNull()).isTrue();
    assertThat(cancelled.get("code").asString()).isEqualTo(code);
  }

  @Test
  void eventStateAndWithdrawalDecideTheStatusAndHideTheValue() throws Exception {
    World w = world();
    Held p = w.participant(NAME, PHONE);
    Held withdrawn = w.participant("철회한 사람", "010-2222-3333");
    jdbc.update(
        "UPDATE applications SET status = 'WITHDRAWN' WHERE participant_id = ?",
        withdrawn.participantId);

    assertStatus(withdrawn.session, "NOT_ELIGIBLE", false);
    assertStatus(p.session, "AVAILABLE", false);
    qr(w, json.readTree(read(p.session)).get("code").asString(), "qr-state");
    assertStatus(p.session, "AVAILABLE", true);

    lifecycle(w.eventId, "DRAFT");
    assertStatus(p.session, "NOT_STARTED", true);
    assertStatus(withdrawn.session, "NOT_STARTED", false);
    lifecycle(w.eventId, "ENDED");
    assertStatus(p.session, "ENDED", true);
    assertStatus(withdrawn.session, "ENDED", false);
    lifecycle(w.eventId, "ARCHIVED");
    assertStatus(p.session, "ENDED", true);
    assertStatus(withdrawn.session, "ENDED", false);
  }

  @Test
  void noSessionOrAnOperatorSessionIsUnauthenticated() throws Exception {
    World w = world();
    w.participant(NAME, PHONE);
    unauthenticated(get(PATH));
    unauthenticated(get(PATH).cookie(new Cookie(PARTICIPANT_COOKIE, "0".repeat(64))));
    unauthenticated(get(PATH).cookie(new Cookie(PARTICIPANT_COOKIE, "")));
    unauthenticated(get(PATH).cookie(w.owner));

    Held p = w.participant("로그아웃", "010-4444-5555");
    mvc.perform(
            post("/api/v1/participant/auth/logout")
                .cookie(p.session, csrf())
                .header(CSRF_HEADER, CSRF))
        .andExpect(status().isNoContent());
    unauthenticated(get(PATH).cookie(p.session));
  }

  @Test
  void anotherEventsValueIsNotFoundInThisEvent() throws Exception {
    World here = world();
    here.participant(NAME, PHONE);
    World elsewhere = world();
    Held stranger = elsewhere.participant("남", "010-3333-4444");
    String strangerCode = json.readTree(read(stranger.session)).get("code").asString();

    mvc.perform(qrRequest(here, strangerCode, "qr-elsewhere"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
    assertThat(checkInRows(here.eventId)).isZero();
    assertThat(json.readTree(qr(elsewhere, strangerCode, "qr-home")).get("result").asString())
        .isEqualTo("CHECKED_IN");
  }

  @Test
  void aValueSignedWithAnotherSecretDoesNotCheckIn() throws Exception {
    World w = world();
    Held p = w.participant(NAME, PHONE);
    String code = json.readTree(read(p.session)).get("code").asString();
    String rotated =
        new CheckInCodes(new CheckInProperties("another-secret"))
            .issue(w.eventId, p.participantId)
            .orElseThrow();
    assertThat(rotated).isNotEqualTo(code);

    mvc.perform(qrRequest(w, rotated, "qr-rotated"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
    assertThat(checkInRows(w.eventId)).isZero();
  }

  @Test
  void blankSecretAnswersNotFoundOnlyWhereAValueWouldBeShown() throws Exception {
    World w = world();
    Held p = w.participant(NAME, PHONE);
    ParticipantSelf self = new ParticipantSelf(p.participantId, w.eventId, w.spaceId, NAME);
    for (String blank : new String[] {null, "", "   "}) {
      ParticipantCheckInService unsigned =
          new ParticipantCheckInService(
              events, checkIns, new CheckInCodes(new CheckInProperties(blank)));
      assertThatThrownBy(() -> unsigned.current(self))
          .isInstanceOfSatisfying(
              SceneException.class,
              thrown -> assertThat(thrown.code()).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));
      lifecycle(w.eventId, "DRAFT");
      ParticipantCheckIn draft = unsigned.current(self);
      assertThat(draft.status()).isEqualTo("NOT_STARTED");
      assertThat(draft.code()).isNull();
      lifecycle(w.eventId, "ACTIVE");
    }
  }

  @Test
  void theValueIsNeverLoggedOrAudited() throws Exception {
    ListAppender<ILoggingEvent> logs = new ListAppender<>();
    logs.start();
    Logger root = (Logger) LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
    root.addAppender(logs);
    try {
      World w = world();
      Held p = w.participant(NAME, PHONE);
      String code = json.readTree(read(p.session)).get("code").asString();
      read(p.session);
      qr(w, code, "qr-log");
      read(p.session);

      for (ILoggingEvent logged : logs.list) {
        assertThat(logged.getFormattedMessage()).doesNotContain(code);
      }
      String audit =
          String.join(
              "\n",
              jdbc.queryForList(
                  "SELECT row_to_json(a)::text FROM audit_logs a WHERE event_id = ?",
                  String.class,
                  w.eventId));
      assertThat(audit).doesNotContain(code);
    } finally {
      root.detachAppender(logs);
    }
  }

  private void assertStatus(Cookie session, String expected, boolean checkedIn) throws Exception {
    JsonNode body = json.readTree(read(session));
    assertThat(body.get("status").asString()).isEqualTo(expected);
    assertThat(body.get("checkedIn").asBoolean()).isEqualTo(checkedIn);
    assertThat(body.get("checkedInAt").isNull()).isEqualTo(!checkedIn);
    if ("AVAILABLE".equals(expected)) {
      assertThat(body.get("code").asString()).startsWith("SCENE-CI1.");
    } else {
      assertThat(body.get("code").isNull()).isTrue();
    }
  }

  private String read(Cookie session) throws Exception {
    return mvc.perform(get(PATH).cookie(session))
        .andExpect(status().isOk())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
        .andReturn()
        .getResponse()
        .getContentAsString();
  }

  private void unauthenticated(MockHttpServletRequestBuilder request) throws Exception {
    mvc.perform(request)
        .andExpect(status().isUnauthorized())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
  }

  private String qr(World w, String code, String key) throws Exception {
    return mvc.perform(qrRequest(w, code, key))
        .andExpect(status().isOk())
        .andReturn()
        .getResponse()
        .getContentAsString();
  }

  private MockHttpServletRequestBuilder qrRequest(World w, String code, String key) {
    return post("/api/v1/operator/events/" + w.eventId + "/check-ins")
        .cookie(w.owner, csrf())
        .header(CSRF_HEADER, CSRF)
        .header("Idempotency-Key", key)
        .contentType(MediaType.APPLICATION_JSON)
        .content(json.writeValueAsString(Map.of("mode", "QR", "code", code)));
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

  /** A space with an ACTIVE event created by its owner. */
  private World world() throws Exception {
    UUID spaceId = UUID.randomUUID();
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, 'Home')", spaceId);
    UUID ownerId = UUID.randomUUID();
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, 'Owner')", ownerId);
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, 'MEMBER')", spaceId, ownerId);
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
    return new World(spaceId, eventId, formId, owner);
  }

  private void lifecycle(UUID eventId, String status) {
    jdbc.update("UPDATE events SET lifecycle_status = ? WHERE id = ?", status, eventId);
  }

  private int checkInRows(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM checkins WHERE event_id = ?", Integer.class, eventId);
  }

  private int auditCount(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_logs WHERE event_id = ?", Integer.class, eventId);
  }

  private record Held(UUID participantId, String accessKey, Cookie session, String token) {}

  private final class World {
    final UUID spaceId;
    final UUID eventId;
    final UUID formId;
    final Cookie owner;

    World(UUID spaceId, UUID eventId, UUID formId, Cookie owner) {
      this.spaceId = spaceId;
      this.eventId = eventId;
      this.formId = formId;
      this.owner = owner;
    }

    /** A participant with one SUBMITTED application, an access key, and a signed-in session. */
    Held participant(String name, String phone) throws Exception {
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
      jdbc.update(
          """
          INSERT INTO applications (
            id, space_id, event_id, form_id, status, submitted_at, participant_id)
          VALUES (?, ?, ?, ?, 'SUBMITTED', now(), ?)
          """,
          UUID.randomUUID(),
          spaceId,
          eventId,
          formId,
          id);
      String accessKey = "access-" + UUID.randomUUID();
      jdbc.update(
          """
          INSERT INTO participant_access (
            id, space_id, event_id, participant_id, key_hash, created_at)
          VALUES (?, ?, ?, ?, ?, now())
          """,
          UUID.randomUUID(),
          spaceId,
          eventId,
          id,
          Digests.sha256Hex(accessKey));
      Cookie session = session(accessKey);
      return new Held(id, accessKey, session, session.getValue());
    }

    /** Signs in through the public session path and returns the participant cookie. */
    Cookie session(String accessKey) throws Exception {
      String prefix = PARTICIPANT_COOKIE + "=";
      List<String> headers =
          mvc.perform(
                  post("/api/v1/public/events/" + eventId + "/participant-sessions")
                      .cookie(csrf())
                      .header(CSRF_HEADER, CSRF)
                      .contentType(MediaType.APPLICATION_JSON)
                      .content("{\"accessKey\":\"" + accessKey + "\"}"))
              .andExpect(status().isNoContent())
              .andReturn()
              .getResponse()
              .getHeaders(HttpHeaders.SET_COOKIE)
              .stream()
              .filter(header -> header.startsWith(prefix))
              .toList();
      assertThat(headers).hasSize(1);
      String header = headers.get(0);
      return new Cookie(PARTICIPANT_COOKIE, header.substring(prefix.length(), header.indexOf(';')));
    }
  }
}
