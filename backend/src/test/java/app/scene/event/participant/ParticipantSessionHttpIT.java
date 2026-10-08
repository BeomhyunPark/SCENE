package app.scene.event.participant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
 * Participant session from a submitted access key. The session lasts until logout. A missing event
 * is the public event-missing code. Other participant paths stay unauthenticated.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class ParticipantSessionHttpIT {

  private static final String OPERATOR_COOKIE = "placeholder-operator-session";
  private static final String PARTICIPANT_COOKIE = "placeholder-participant-session";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;

  @Autowired
  @Qualifier("requestMappingHandlerMapping")
  RequestMappingHandlerMapping handlers;

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
  void issuedSessionReadsMeAndLogoutDropsOnlyThatRow() throws Exception {
    Held event = openEvent("Session owner");
    Opened form = acceptingForm(event);
    Submitted first = submit(form, "김", "010-1234-5678");
    Submitted second = submit(form, "이", "010-9999-0000");
    int audits = auditCount(form.eventId);
    int operatorSessions = springSessionCount();

    MvcResult issued = issue(form.eventId, "{\"accessKey\":\"  " + first.accessKey + "  \"}");
    String setCookie = participantCookieHeader(issued);
    String token = cookieValue(setCookie);
    assertThat(issued.getResponse().getContentAsString()).isEmpty();
    assertThat(setCookie).contains("HttpOnly", "Secure", "SameSite=Lax");
    assertThat(setCookie).contains("Path=/api/v1/participant");
    assertThat(setCookie).doesNotContain("Max-Age", "Expires=", "Domain=");
    assertThat(setCookie)
        .doesNotContain(
            OPERATOR_COOKIE,
            "scene_participant_session",
            "scene_operator_session",
            first.accessKey);
    assertThat(token).hasSize(64).matches("[0-9a-f]+").isNotEqualTo(first.accessKey);
    assertThat(storedTokenHash(first.participantId)).isEqualTo(Digests.sha256Hex(token));
    assertThat(countToken(token)).isZero();
    assertThat(sessionCount()).isEqualTo(1);
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
    assertThat(body.propertyNames()).containsExactly("participantId", "eventId", "spaceId", "name");
    assertThat(body.get("participantId").asString()).isEqualTo(first.participantId.toString());
    assertThat(body.get("eventId").asString()).isEqualTo(form.eventId.toString());
    assertThat(body.get("spaceId").asString()).isEqualTo(event.spaceId.toString());
    assertThat(body.get("name").asString()).isEqualTo("김");
    assertThat(me).doesNotContain("010-1234-5678", first.accessKey, "key_hash", "phone");

    Cookie session = new Cookie(PARTICIPANT_COOKIE, token);
    mvc.perform(get("/api/v1/participant/events").cookie(session))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
    mvc.perform(get("/api/v1/participant/me").cookie(event.owner))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));

    String other =
        cookieValue(participantCookieHeader(issue(form.eventId, keyBody(second.accessKey))));
    mvc.perform(
            post("/api/v1/participant/auth/logout")
                .cookie(session, csrf())
                .header(CSRF_HEADER, CSRF))
        .andExpect(status().isNoContent())
        .andExpect(content().string(""));
    assertThat(sessionCount()).isEqualTo(1);
    assertThat(countTokenHash(Digests.sha256Hex(token))).isZero();
    assertThat(countTokenHash(Digests.sha256Hex(other))).isEqualTo(1);
    mvc.perform(get("/api/v1/participant/me").cookie(session))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
    mvc.perform(get("/api/v1/participant/me").cookie(new Cookie(PARTICIPANT_COOKIE, other)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.name").value("이"));

    int remaining = sessionCount();
    mvc.perform(post("/api/v1/participant/auth/logout").cookie(csrf()).header(CSRF_HEADER, CSRF))
        .andExpect(status().isNoContent());
    assertThat(sessionCount()).isEqualTo(remaining);
  }

  @Test
  void invalidKeysShareOneBodyAndWriteNothing() throws Exception {
    Held event = openEvent("Invalid owner");
    Opened form = acceptingForm(event);
    Submitted submitted = submit(form, "박", "010-1111-2222");
    Held other = openEvent("Other owner");
    String wrong = "wrong-key-not-stored";
    int before = sessionCount();

    JsonNode missingEvent =
        problem(
            issueRequest(UUID.randomUUID(), keyBody(submitted.accessKey), "req-missing-event"),
            404,
            "RESOURCE_NOT_FOUND");
    assertThat(missingEvent.get("type").asString())
        .isEqualTo("urn:scene:problem:resource-not-found");

    JsonNode wrongKey =
        problem(
            issueRequest(form.eventId, keyBody(wrong), "req-wrong"),
            401,
            "PARTICIPANT_ACCESS_INVALID");
    JsonNode missingKey =
        problem(issueRequest(form.eventId, "{}", "req-missing"), 401, "PARTICIPANT_ACCESS_INVALID");
    JsonNode otherEvent =
        problem(
            issueRequest(other.eventId, keyBody(submitted.accessKey), "req-other"),
            401,
            "PARTICIPANT_ACCESS_INVALID");
    JsonNode queryOnly =
        problem(
            post("/api/v1/public/events/"
                    + form.eventId
                    + "/participant-sessions?accessKey="
                    + submitted.accessKey)
                .cookie(csrf())
                .header(CSRF_HEADER, CSRF)
                .header("X-Request-Id", "req-query")
                .contentType(MediaType.APPLICATION_JSON)
                .content(""),
            401,
            "PARTICIPANT_ACCESS_INVALID");
    JsonNode extra =
        problem(
            issueRequest(
                form.eventId,
                "{\"accessKey\":\"" + submitted.accessKey + "\",\"note\":\"x\"}",
                "req-extra"),
            401,
            "PARTICIPANT_ACCESS_INVALID");

    assertThat(wrongKey.get("type").asString())
        .isEqualTo("urn:scene:problem:participant-access-invalid");
    assertThat(wrongKey.get("title").asString()).isEqualTo("Participant access invalid");
    assertThat(wrongKey.get("detail").asString()).isEqualTo(missingKey.get("detail").asString());
    assertThat(otherEvent.get("detail").asString()).isEqualTo(wrongKey.get("detail").asString());
    assertThat(queryOnly.get("detail").asString()).isEqualTo(wrongKey.get("detail").asString());
    assertThat(extra.get("detail").asString()).isEqualTo(wrongKey.get("detail").asString());
    assertThat(wrongKey.get("title").asString()).isEqualTo(missingKey.get("title").asString());
    assertThat(otherEvent.get("type").asString()).isEqualTo(wrongKey.get("type").asString());
    for (JsonNode problem : List.of(wrongKey, missingKey, otherEvent, queryOnly, extra)) {
      assertThat(problem.toString())
          .doesNotContain(submitted.accessKey, wrong, "010-1111-2222", "key_hash");
    }
    assertThat(sessionCount()).isEqualTo(before);
    assertThat(sessionsFor(form.eventId)).isZero();
    assertThat(sessionsFor(other.eventId)).isZero();
    assertThat(missingEvent.get("code").asString()).isEqualTo("RESOURCE_NOT_FOUND");
  }

  @Test
  void routesStayInsideThisSlice() {
    boolean sessionPost = false;
    boolean me = false;
    boolean logout = false;
    for (RequestMappingInfo info : handlers.getHandlerMethods().keySet()) {
      for (String pattern : info.getPatternValues()) {
        assertThat(pattern).doesNotContain("reissue");
        assertThat(pattern).isNotEqualTo("/api/v1/public/events/{eventId}/forms/{formId}");
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
      }
    }
    assertThat(sessionPost).isTrue();
    assertThat(me).isTrue();
    assertThat(logout).isTrue();

    List<String> sessionColumns = columns("participant_sessions");
    assertThat(sessionColumns)
        .containsExactlyInAnyOrder(
            "id",
            "space_id",
            "event_id",
            "participant_id",
            "participant_access_id",
            "token_hash",
            "created_at");
    assertThat(columns("participant_access")).doesNotContain("revoked_at");
    assertThat(sessionColumns).doesNotContain("revoked_at", "expires_at");
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
    mvc.perform(get("/api/v1/participant/anywhere"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
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

  private static String keyBody(String accessKey) {
    return "{\"accessKey\":\"" + accessKey + "\"}";
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
    String created =
        mvc.perform(
                post("/api/v1/public/events/"
                        + form.eventId
                        + "/forms/"
                        + form.formId
                        + "/applications")
                    .cookie(csrf())
                    .header(CSRF_HEADER, CSRF)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(answers(form, name, phone)))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    JsonNode body = json.readTree(created);
    return new Submitted(
        UUID.fromString(body.get("participantId").asString()), body.get("accessKey").asString());
  }

  private static String answers(Opened form, String name, String phone) {
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
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, 'MEMBER')", spaceId, memberId);
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

  private record Submitted(UUID participantId, String accessKey) {}
}
