package app.scene.event.participant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.ratelimit.FailureLockout;
import app.scene.common.web.RequestIdFilter;
import app.scene.support.PostgresTestcontainer;
import jakarta.servlet.http.Cookie;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
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
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Participant session from name, phone and the six-digit number (DEC-078). The first submit opens a
 * session. Wrong parts share one body; a phone locks after five failures in a row; an operator
 * reset gives a temporary number that must be replaced. Other participant paths stay
 * unauthenticated.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class ParticipantSessionHttpIT {

  private static final String OPERATOR_COOKIE = "SCENE_SESSION";
  private static final String PARTICIPANT_COOKIE = "SCENE_PSESSION";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;
  @Autowired FailureLockout lockout;

  @Autowired
  @Qualifier("requestMappingHandlerMapping")
  RequestMappingHandlerMapping handlers;

  MockMvc mvc;

  @BeforeEach
  void mockMvc() {
    lockout.clear();
    mvc =
        MockMvcBuilders.webAppContextSetup(context)
            .addFilters(
                context.getBean(RequestIdFilter.class),
                context.getBean(SessionRepositoryFilter.class))
            .apply(SecurityMockMvcConfigurers.springSecurity())
            .build();
  }

  private static final String PIN = "730914";

  @Test
  void submitOpensSessionAndNamePhoneNumberSignInAgain() throws Exception {
    Held event = openEvent("Session owner");
    Opened form = acceptingForm(event);
    MvcResult submitted = submitResult(form, "김 하늘", "010-1234-5678", PIN, 201);
    JsonNode created = json.readTree(submitted.getResponse().getContentAsString());
    assertThat(created.propertyNames())
        .containsExactly(
            "applicationId", "participantId", "revision", "revised", "completionNotice");
    assertThat(created.get("revision").asInt()).isEqualTo(1);
    assertThat(created.get("revised").asBoolean()).isFalse();
    assertThat(submitted.getResponse().getContentAsString()).doesNotContain(PIN);
    UUID first = UUID.fromString(created.get("participantId").asString());
    String submitCookie = participantCookieHeader(submitted);
    String fromSubmit = cookieValue(submitCookie);
    // DEC-078 §3: the cookie outlives the browser. No end date: 180 days.
    assertThat(submitCookie)
        .contains("Max-Age=15552000", "HttpOnly", "Secure", "Path=/api/v1/participant");
    String stored =
        jdbc.queryForObject("SELECT pin_hash FROM participants WHERE id = ?", String.class, first);
    assertThat(stored).startsWith("$2").doesNotContain(PIN);
    Submitted second = submit(form, "이", "010-9999-0000");
    int audits = auditCount(form.eventId);
    int operatorSessions = springSessionCount();

    mvc.perform(get("/api/v1/participant/me").cookie(new Cookie(PARTICIPANT_COOKIE, fromSubmit)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.name").value("김 하늘"));

    // Name spaces are folded and the phone compares by digits.
    MvcResult issued = issue(form.eventId, signIn("  김   하늘 ", "01012345678", PIN));
    String setCookie = participantCookieHeader(issued);
    String token = cookieValue(setCookie);
    assertThat(issued.getResponse().getContentAsString()).isEmpty();
    assertThat(setCookie).startsWith(PARTICIPANT_COOKIE + "=");
    assertThat(setCookie).contains("HttpOnly", "Secure", "SameSite=Lax");
    assertThat(setCookie).contains("Path=/api/v1/participant");
    assertThat(setCookie).contains("Max-Age=15552000").doesNotContain("Domain=", PIN);
    assertThat(token).hasSize(64).matches("[0-9a-f]+");
    assertThat(countTokenHash(Digests.sha256Hex(token))).isEqualTo(1);
    assertThat(countToken(token)).isZero();
    assertThat(sessionCount(form.eventId)).isEqualTo(3);
    assertThat(springSessionCount()).isEqualTo(operatorSessions);
    assertThat(auditCount(form.eventId)).isEqualTo(audits);

    String me =
        mvc.perform(get("/api/v1/participant/me").cookie(new Cookie(PARTICIPANT_COOKIE, token)))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
            .andReturn()
            .getResponse()
            .getContentAsString();
    JsonNode body = json.readTree(me);
    assertThat(body.propertyNames())
        .containsExactly("participantId", "eventId", "spaceId", "name", "pinChangeRequired");
    assertThat(body.get("participantId").asString()).isEqualTo(first.toString());
    assertThat(body.get("eventId").asString()).isEqualTo(form.eventId.toString());
    assertThat(body.get("spaceId").asString()).isEqualTo(event.spaceId.toString());
    assertThat(body.get("pinChangeRequired").asBoolean()).isFalse();
    assertThat(me).doesNotContain("010-1234-5678", PIN, "pin_hash", "phone");

    Cookie session = new Cookie(PARTICIPANT_COOKIE, token);
    mvc.perform(get("/api/v1/participant/events").cookie(session))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
    mvc.perform(get("/api/v1/participant/me").cookie(event.owner))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));

    String other =
        cookieValue(
            participantCookieHeader(issue(form.eventId, signIn("이", "010-9999-0000", PIN))));
    String cleared =
        mvc.perform(
                post("/api/v1/participant/auth/logout")
                    .cookie(session, csrf())
                    .header(CSRF_HEADER, CSRF))
            .andExpect(status().isNoContent())
            .andExpect(content().string(""))
            .andReturn()
            .getResponse()
            .getHeader(HttpHeaders.SET_COOKIE);
    assertThat(cleared)
        .startsWith(PARTICIPANT_COOKIE + "=;")
        .contains("Max-Age=0", "HttpOnly", "Secure", "Path=/api/v1/participant");
    assertThat(countTokenHash(Digests.sha256Hex(token))).isZero();
    assertThat(countTokenHash(Digests.sha256Hex(other))).isEqualTo(1);
    mvc.perform(get("/api/v1/participant/me").cookie(session)).andExpect(status().isUnauthorized());
    mvc.perform(get("/api/v1/participant/me").cookie(new Cookie(PARTICIPANT_COOKIE, other)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.participantId").value(second.participantId.toString()));
  }

  @Test
  void wrongPartsShareOneBodyAndFiveFailuresLockThePhone() throws Exception {
    Held event = openEvent("Invalid owner");
    Opened form = acceptingForm(event);
    submit(form, "박", "010-1111-2222");
    Held other = openEvent("Other owner");
    int before = sessionCount();

    JsonNode missingEvent =
        problem(
            issueRequest(UUID.randomUUID(), signIn("박", "010-1111-2222", PIN), "req-missing"),
            404,
            "RESOURCE_NOT_FOUND");
    assertThat(missingEvent.get("type").asString())
        .isEqualTo("urn:scene:problem:resource-not-found");

    JsonNode wrongPin = failed(form.eventId, signIn("박", "010-1111-2222", "482915"));
    JsonNode wrongName = failed(form.eventId, signIn("최", "010-1111-2222", PIN));
    JsonNode unknownPhone = failed(form.eventId, signIn("박", "010-1111-2223", PIN));
    JsonNode otherEvent = failed(other.eventId, signIn("박", "010-1111-2222", PIN));
    assertThat(wrongPin.get("type").asString())
        .isEqualTo("urn:scene:problem:participant-login-failed");
    for (JsonNode problem : List.of(wrongName, unknownPhone, otherEvent)) {
      assertThat(problem.get("detail").asString()).isEqualTo(wrongPin.get("detail").asString());
      assertThat(problem.get("title").asString()).isEqualTo(wrongPin.get("title").asString());
    }
    for (JsonNode problem : List.of(wrongPin, wrongName, unknownPhone, otherEvent)) {
      assertThat(problem.toString()).doesNotContain(PIN, "482915", "010-1111-2222", "pin_hash");
    }

    // Old access-key bodies and extra keys are request errors, not sign-in failures.
    problem(
        issueRequest(form.eventId, "{\"accessKey\":\"x\"}", "req-key"), 400, "VALIDATION_FAILED");
    problem(
        issueRequest(
            form.eventId,
            "{\"name\":\"박\",\"phone\":\"010-1111-2222\",\"pin\":\"" + PIN + "\",\"x\":1}",
            "req-extra"),
        400,
        "VALIDATION_FAILED");

    // Two failures so far on this phone (wrong number, wrong name). Three more lock it.
    failed(form.eventId, signIn("박", "010-1111-2222", "482916"));
    failed(form.eventId, signIn("박", "010-1111-2222", "482917"));
    failed(form.eventId, signIn("박", "010-1111-2222", "482918"));
    JsonNode locked =
        problem(
            issueRequest(form.eventId, signIn("박", "010-1111-2222", PIN), "req-locked"),
            429,
            "PARTICIPANT_LOGIN_LOCKED");
    assertThat(locked.get("retryAfterSeconds").asLong()).isBetween(1L, 300L);

    // A phone without an application locks the same way, so the lock says nothing about it.
    for (int i = 0; i < 4; i++) {
      failed(form.eventId, signIn("박", "010-1111-2223", "48291" + i));
    }
    problem(
        issueRequest(form.eventId, signIn("박", "010-1111-2223", PIN), "req-locked-unknown"),
        429,
        "PARTICIPANT_LOGIN_LOCKED");
    assertThat(sessionCount()).isEqualTo(before);
    assertThat(sessionsFor(other.eventId)).isZero();
  }

  @Test
  void successResetsTheFailureCount() throws Exception {
    Held event = openEvent("Reset count owner");
    Opened form = acceptingForm(event);
    submit(form, "하", "010-3131-2222");
    for (int i = 0; i < 4; i++) {
      failed(form.eventId, signIn("하", "010-3131-2222", "58291" + i));
    }
    issue(form.eventId, signIn("하", "010-3131-2222", PIN));
    for (int i = 0; i < 4; i++) {
      failed(form.eventId, signIn("하", "010-3131-2222", "58291" + i));
    }
    issue(form.eventId, signIn("하", "010-3131-2222", PIN));
  }

  @Test
  void weakNumbersAreRejectedAndStoreNothing() throws Exception {
    Held event = openEvent("Weak owner");
    Opened form = acceptingForm(event);
    int before = participantCount(form.eventId);
    for (String pin :
        new String[] {
          "000000", "999999", "123456", "654321", "345678", "739148", "12345", "1234567", "73a914",
          ""
        }) {
      MvcResult result = submitResult(form, "강", "010-7391-4826", pin, 400);
      assertThat(json.readTree(result.getResponse().getContentAsString()).get("code").asString())
          .isEqualTo("PARTICIPANT_PIN_WEAK");
      assertThat(result.getResponse().getContentAsString())
          .doesNotContain(pin.isEmpty() ? "@" : pin);
    }
    String missing =
        mvc.perform(submitRequest(form, answersWithoutPin(form, "강", "010-7391-4826")))
            .andExpect(status().isBadRequest())
            .andReturn()
            .getResponse()
            .getContentAsString();
    assertThat(json.readTree(missing).get("code").asString()).isEqualTo("PARTICIPANT_PIN_WEAK");
    assertThat(participantCount(form.eventId)).isEqualTo(before);
  }

  @Test
  void operatorResetGivesATemporaryNumberThatMustBeReplaced() throws Exception {
    Held event = openEvent("Pin reset owner");
    Opened form = acceptingForm(event);
    MvcResult submitted = submitResult(form, "윤", "010-4545-6767", PIN, 201);
    UUID participantId =
        UUID.fromString(
            json.readTree(submitted.getResponse().getContentAsString())
                .get("participantId")
                .asString());
    Cookie before = new Cookie(PARTICIPANT_COOKIE, cookieValue(participantCookieHeader(submitted)));
    for (int i = 0; i < 4; i++) {
      failed(form.eventId, signIn("윤", "010-4545-6767", "68291" + i));
    }
    int audits = auditCount(form.eventId);

    MvcResult reset =
        mvc.perform(
                write(
                    post(
                        "/api/v1/operator/events/"
                            + form.eventId
                            + "/participants/"
                            + participantId
                            + "/pin-reset"),
                    event.owner,
                    "{}"))
            .andExpect(status().isOk())
            .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
            .andReturn();
    JsonNode resetBody = json.readTree(reset.getResponse().getContentAsString());
    assertThat(resetBody.propertyNames()).containsExactly("temporaryPin");
    String temporary = resetBody.get("temporaryPin").asString();
    assertThat(temporary).matches("[0-9]{6}");
    assertThat(auditCount(form.eventId)).isEqualTo(audits + 1);
    String detail =
        jdbc.queryForObject(
            "SELECT detail::text FROM audit_logs WHERE event_id = ? AND action = 'PARTICIPANT_PIN_RESET'",
            String.class,
            form.eventId);
    assertThat(detail).contains(participantId.toString()).doesNotContain(temporary, PIN);
    assertThat(sessionsFor(form.eventId)).isZero();
    mvc.perform(get("/api/v1/participant/me").cookie(before)).andExpect(status().isUnauthorized());

    // The reset also cleared the four failures, and the old number no longer works.
    failed(form.eventId, signIn("윤", "010-4545-6767", PIN));
    Cookie temp =
        new Cookie(
            PARTICIPANT_COOKIE,
            cookieValue(
                participantCookieHeader(
                    issue(form.eventId, signIn("윤", "010-4545-6767", temporary)))));
    mvc.perform(get("/api/v1/participant/me").cookie(temp))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.pinChangeRequired").value(true));
    mvc.perform(get("/api/v1/participant/check-in").cookie(temp))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("PARTICIPANT_PIN_CHANGE_REQUIRED"));
    mvc.perform(get("/api/v1/participant/application").cookie(temp))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("PARTICIPANT_PIN_CHANGE_REQUIRED"));
    mvc.perform(pin(temp, "{\"newPin\":\"456789\"}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("PARTICIPANT_PIN_WEAK"));
    mvc.perform(pin(temp, "{\"newPin\":\"" + "904172" + "\"}")).andExpect(status().isNoContent());
    mvc.perform(get("/api/v1/participant/me").cookie(temp))
        .andExpect(jsonPath("$.pinChangeRequired").value(false));
    mvc.perform(get("/api/v1/participant/application").cookie(temp)).andExpect(status().isOk());
    failed(form.eventId, signIn("윤", "010-4545-6767", temporary));
    issue(form.eventId, signIn("윤", "010-4545-6767", "904172"));

    // A missing participant is 404; another event's participant is 404 too.
    mvc.perform(
            write(
                post(
                    "/api/v1/operator/events/"
                        + form.eventId
                        + "/participants/"
                        + UUID.randomUUID()
                        + "/pin-reset"),
                event.owner,
                "{}"))
        .andExpect(status().isNotFound());
  }

  @Test
  void resetNeedsParticipantWrite() throws Exception {
    Held event = openEvent("Write owner");
    Opened form = acceptingForm(event);
    Submitted person = submit(form, "문", "010-8282-1212");
    UUID staffId = UUID.randomUUID();
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, ?)", staffId, "Staff");
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, 'MEMBER')",
        event.spaceId,
        staffId);
    jdbc.update(
        "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, 'STAFF')",
        event.spaceId,
        form.eventId,
        staffId);
    Cookie staff = login(staffId);
    mvc.perform(
            write(
                post(
                    "/api/v1/operator/events/"
                        + form.eventId
                        + "/participants/"
                        + person.participantId
                        + "/pin-reset"),
                staff,
                "{}"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    assertThat(
            jdbc.queryForObject(
                "SELECT pin_temporary FROM participants WHERE id = ?",
                Boolean.class,
                person.participantId))
        .isFalse();
  }

  /** DEC-079 Follow-up 2026-11-20: MANAGER holds PARTICIPANT_WRITE by default. */
  @Test
  void managerResetsByDefault() throws Exception {
    Held event = openEvent("Manager reset owner");
    Opened form = acceptingForm(event);
    Submitted person = submit(form, "남", "010-8383-1313");
    UUID managerId = UUID.randomUUID();
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, ?)", managerId, "Manager");
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, 'MEMBER')",
        event.spaceId,
        managerId);
    jdbc.update(
        "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, 'MANAGER')",
        event.spaceId,
        form.eventId,
        managerId);
    mvc.perform(
            write(
                post(
                    "/api/v1/operator/events/"
                        + form.eventId
                        + "/participants/"
                        + person.participantId
                        + "/pin-reset"),
                login(managerId),
                "{}"))
        .andExpect(status().isOk());
    assertThat(
            jdbc.queryForObject(
                "SELECT pin_temporary FROM participants WHERE id = ?",
                Boolean.class,
                person.participantId))
        .isTrue();
  }

  @Test
  void changingTheNumberNeedsTheCurrentOneAndEndsOtherSessions() throws Exception {
    Held event = openEvent("Change owner");
    Opened form = acceptingForm(event);
    MvcResult submitted = submitResult(form, "서", "010-6161-7171", PIN, 201);
    Cookie first = new Cookie(PARTICIPANT_COOKIE, cookieValue(participantCookieHeader(submitted)));
    Cookie second =
        new Cookie(
            PARTICIPANT_COOKIE,
            cookieValue(
                participantCookieHeader(issue(form.eventId, signIn("서", "010-6161-7171", PIN)))));
    mvc.perform(pin(first, "{\"newPin\":\"904172\"}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    mvc.perform(pin(first, "{\"currentPin\":\"111112\",\"newPin\":\"904172\"}"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("PARTICIPANT_LOGIN_FAILED"));
    mvc.perform(pin(first, "{\"currentPin\":\"" + PIN + "\",\"newPin\":\"904172\"}"))
        .andExpect(status().isNoContent());
    mvc.perform(get("/api/v1/participant/me").cookie(first)).andExpect(status().isOk());
    mvc.perform(get("/api/v1/participant/me").cookie(second)).andExpect(status().isUnauthorized());
    issue(form.eventId, signIn("서", "010-6161-7171", "904172"));
  }

  @Test
  void sessionsEndSevenDaysAfterTheDayAfterTheEndDate() throws Exception {
    Held event = openEvent("Ttl owner");
    Opened form = acceptingForm(event);
    MvcResult submitted = submitResult(form, "고", "010-2323-4545", PIN, 201);
    Cookie session =
        new Cookie(PARTICIPANT_COOKIE, cookieValue(participantCookieHeader(submitted)));
    jdbc.update(
        "UPDATE events SET end_date = (now() AT TIME ZONE 'Asia/Seoul')::date - 7 WHERE id = ?",
        form.eventId);
    mvc.perform(get("/api/v1/participant/me").cookie(session)).andExpect(status().isOk());
    // A new session's cookie lives until the same limit: end date + 8 days, 00:00 Asia/Seoul.
    long maxAge =
        maxAgeOf(participantCookieHeader(issue(form.eventId, signIn("고", "010-2323-4545", PIN))));
    java.time.ZoneId seoul = java.time.ZoneId.of("Asia/Seoul");
    long expected =
        java.time.Duration.between(
                java.time.Instant.now(),
                java.time.LocalDate.now(seoul).plusDays(1).atStartOfDay(seoul).toInstant())
            .getSeconds();
    assertThat(maxAge).isBetween(expected - 60, expected + 60);
    jdbc.update(
        "UPDATE events SET end_date = (now() AT TIME ZONE 'Asia/Seoul')::date - 8 WHERE id = ?",
        form.eventId);
    mvc.perform(get("/api/v1/participant/me").cookie(session))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
  }

  @Test
  void routesStayInsideThisSlice() {
    boolean sessionPost = false;
    boolean me = false;
    boolean logout = false;
    boolean pin = false;
    for (var entry : handlers.getHandlerMethods().entrySet()) {
      if (!entry
          .getValue()
          .getBeanType()
          .getPackageName()
          .startsWith("app.scene.event.participant")) {
        continue;
      }
      RequestMappingInfo info = entry.getKey();
      for (String pattern : info.getPatternValues()) {
        assertThat(pattern).doesNotContain("reissue", "access");
        if (pattern.equals("/api/v1/public/events/{eventId}/participant-sessions")) {
          assertThat(info.getMethodsCondition().getMethods()).containsExactly(RequestMethod.POST);
          sessionPost = true;
        }
        if (pattern.equals("/api/v1/participant/me")) {
          assertThat(info.getMethodsCondition().getMethods()).containsExactly(RequestMethod.GET);
          me = true;
        }
        if (pattern.equals("/api/v1/participant/auth/logout")) {
          assertThat(info.getMethodsCondition().getMethods()).containsExactly(RequestMethod.POST);
          logout = true;
        }
        if (pattern.equals("/api/v1/participant/pin")) {
          assertThat(info.getMethodsCondition().getMethods()).containsExactly(RequestMethod.PUT);
          pin = true;
        }
      }
    }
    assertThat(sessionPost).isTrue();
    assertThat(me).isTrue();
    assertThat(logout).isTrue();
    assertThat(pin).isTrue();
    assertThat(columns("participants")).contains("phone_key", "pin_hash", "pin_temporary");
    assertThat(columns("participants")).doesNotContain("pin");
  }

  @Test
  void missingCookieIsAuthenticationRequiredAndCsrfStillApplies() throws Exception {
    mvc.perform(get("/api/v1/participant/me").header("X-Request-Id", "req-me"))
        .andExpect(status().isUnauthorized())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"))
        .andExpect(jsonPath("$.traceId").value("req-me"));
    mvc.perform(post("/api/v1/public/events/" + UUID.randomUUID() + "/participant-sessions"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    mvc.perform(
            put("/api/v1/participant/pin").contentType(MediaType.APPLICATION_JSON).content("{}"))
        .andExpect(status().isForbidden());
    mvc.perform(get("/api/v1/participant/anywhere"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
  }

  private static long maxAgeOf(String setCookie) {
    java.util.regex.Matcher m =
        java.util.regex.Pattern.compile("Max-Age=(\\d+)").matcher(setCookie);
    assertThat(m.find()).isTrue();
    return Long.parseLong(m.group(1));
  }

  private JsonNode failed(UUID eventId, String body) throws Exception {
    return problem(issueRequest(eventId, body, "req-failed"), 401, "PARTICIPANT_LOGIN_FAILED");
  }

  private static String signIn(String name, String phone, String pin) {
    return "{\"name\":\"" + name + "\",\"phone\":\"" + phone + "\",\"pin\":\"" + pin + "\"}";
  }

  private static MockHttpServletRequestBuilder pin(Cookie session, String body) {
    return put("/api/v1/participant/pin")
        .cookie(session, csrf())
        .header(CSRF_HEADER, CSRF)
        .contentType(MediaType.APPLICATION_JSON)
        .content(body);
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

  private int participantCount(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM participants WHERE event_id = ?", Integer.class, eventId);
  }

  private MvcResult issue(UUID eventId, String body) throws Exception {
    return mvc.perform(issueRequest(eventId, body, "req-issue"))
        .andExpect(status().isNoContent())
        .andReturn();
  }

  private MockHttpServletRequestBuilder issueRequest(UUID eventId, String body, String requestId) {
    return post("/api/v1/public/events/" + eventId + "/participant-sessions")
        .cookie(csrf())
        .header(CSRF_HEADER, CSRF)
        .header("X-Request-Id", requestId)
        .contentType(MediaType.APPLICATION_JSON)
        .content(body);
  }

  private JsonNode problem(MockHttpServletRequestBuilder request, int httpStatus, String code)
      throws Exception {
    MvcResult result =
        mvc.perform(request)
            .andExpect(status().is(httpStatus))
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("$.code").value(code))
            .andReturn();
    for (String header : result.getResponse().getHeaders(HttpHeaders.SET_COOKIE)) {
      assertThat(header).doesNotStartWith(PARTICIPANT_COOKIE + "=");
    }
    String text = result.getResponse().getContentAsString();
    assertThat(text).doesNotContain(PARTICIPANT_COOKIE);
    return json.readTree(text);
  }

  private static String participantCookieHeader(MvcResult result) {
    List<String> matches = new ArrayList<>();
    for (String header : result.getResponse().getHeaders(HttpHeaders.SET_COOKIE)) {
      if (header.startsWith(PARTICIPANT_COOKIE + "=")) {
        matches.add(header);
      }
    }
    assertThat(matches).hasSize(1);
    return matches.get(0);
  }

  private static String cookieValue(String header) {
    String prefix = PARTICIPANT_COOKIE + "=";
    return header.substring(prefix.length(), header.indexOf(';'));
  }

  private Submitted submit(Opened form, String name, String phone) throws Exception {
    MvcResult result = submitResult(form, name, phone, PIN, 201);
    JsonNode body = json.readTree(result.getResponse().getContentAsString());
    return new Submitted(UUID.fromString(body.get("participantId").asString()));
  }

  private MvcResult submitResult(Opened form, String name, String phone, String pin, int status)
      throws Exception {
    String body =
        answersWithoutPin(form, name, phone).replaceFirst("^\\{", "{\"pin\":\"" + pin + "\",");
    return mvc.perform(submitRequest(form, body)).andExpect(status().is(status)).andReturn();
  }

  private static MockHttpServletRequestBuilder submitRequest(Opened form, String body) {
    return post("/api/v1/public/events/" + form.eventId + "/forms/" + form.formId + "/applications")
        .cookie(csrf())
        .header(CSRF_HEADER, CSRF)
        .contentType(MediaType.APPLICATION_JSON)
        .content(body);
  }

  private static String answersWithoutPin(Opened form, String name, String phone) {
    return "{\"answers\":["
        + "{\"fieldId\":\""
        + form.nameId
        + "\",\"text\":\"  "
        + name
        + "  \"},"
        + "{\"fieldId\":\""
        + form.phoneId
        + "\",\"text\":\""
        + phone
        + "\"}]}";
  }

  private Opened acceptingForm(Held event) throws Exception {
    String created =
        mvc.perform(
                write(
                    post("/api/v1/operator/events/" + event.eventId + "/forms"),
                    event.owner,
                    "{\"customLabel\":\"식사\"}"))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    JsonNode body = json.readTree(created);
    // 또래 is turned off here so these cases keep the two always-on SYSTEM questions (DEC-070).
    mvc.perform(
            write(
                patch(
                    "/api/v1/operator/events/"
                        + event.eventId
                        + "/forms/"
                        + body.get("formId").asString()
                        + "/fields/"
                        + body.get("fields").get(2).get("fieldId").asString()),
                event.owner,
                "{\"hidden\":true}"))
        .andExpect(status().isOk());
    UUID formId = UUID.fromString(body.get("formId").asString());
    mvc.perform(
            write(
                post("/api/v1/operator/events/" + event.eventId + "/activate"),
                event.owner,
                "{\"expectedLifecycleVersion\":0}"))
        .andExpect(status().isOk());
    mvc.perform(
            write(
                patch("/api/v1/operator/events/" + event.eventId + "/forms/" + formId),
                event.owner,
                "{\"acceptingApplications\":true}"))
        .andExpect(status().isOk());
    return new Opened(
        event.eventId,
        formId,
        UUID.fromString(body.get("fields").get(0).get("fieldId").asString()),
        UUID.fromString(body.get("fields").get(1).get("fieldId").asString()));
  }

  private Held openEvent(String memberName) throws Exception {
    UUID spaceId = UUID.randomUUID();
    UUID memberId = UUID.randomUUID();
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, ?)", spaceId, "Home");
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, ?)", memberId, memberName);
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, 'OWNER')", spaceId, memberId);
    Cookie owner =
        mvc.perform(
                post("/api/v1/operator/auth/login")
                    .cookie(csrf())
                    .header(CSRF_HEADER, CSRF)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"userId\":\"" + memberId + "\"}"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getCookie(OPERATOR_COOKIE);
    assertThat(owner).isNotNull();
    String created =
        mvc.perform(
                write(
                    post("/api/v1/operator/spaces/" + spaceId + "/events"),
                    owner,
                    "{\"name\":\"행사\"}"))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    return new Held(
        spaceId, UUID.fromString(json.readTree(created).get("eventId").asString()), owner);
  }

  private static MockHttpServletRequestBuilder write(
      MockHttpServletRequestBuilder request, Cookie session, String body) {
    return request
        .cookie(session, csrf())
        .header(CSRF_HEADER, CSRF)
        .contentType(MediaType.APPLICATION_JSON)
        .content(body);
  }

  private static Cookie csrf() {
    return new Cookie(CSRF_COOKIE, CSRF);
  }

  private String storedTokenHash(UUID participantId) {
    return jdbc.queryForObject(
        "SELECT token_hash FROM participant_sessions WHERE participant_id = ?",
        String.class,
        participantId);
  }

  private int countToken(String rawToken) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM participant_sessions WHERE token_hash = ?", Integer.class, rawToken);
  }

  private int countTokenHash(String tokenHash) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM participant_sessions WHERE token_hash = ?", Integer.class, tokenHash);
  }

  private int sessionCount() {
    return jdbc.queryForObject("SELECT count(*) FROM participant_sessions", Integer.class);
  }

  /** Sessions of one event. Other test classes share the database and leave their own rows. */
  private int sessionCount(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM participant_sessions WHERE event_id = ?", Integer.class, eventId);
  }

  private int sessionsFor(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM participant_sessions WHERE event_id = ?", Integer.class, eventId);
  }

  private int springSessionCount() {
    return jdbc.queryForObject("SELECT count(*) FROM spring_session", Integer.class);
  }

  private int auditCount(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_logs WHERE event_id = ?", Integer.class, eventId);
  }

  private List<String> columns(String table) {
    return jdbc.queryForList(
        "SELECT column_name FROM information_schema.columns "
            + "WHERE table_schema = 'public' AND table_name = ? ORDER BY column_name",
        String.class,
        table);
  }

  private record Held(UUID spaceId, UUID eventId, Cookie owner) {}

  private record Opened(UUID eventId, UUID formId, UUID nameId, UUID phoneId) {}

  private record Submitted(UUID participantId) {}
}
