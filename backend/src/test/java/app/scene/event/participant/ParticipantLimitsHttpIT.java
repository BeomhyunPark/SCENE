package app.scene.event.participant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.ratelimit.FailureLockout;
import app.scene.common.ratelimit.InMemoryRateLimiter;
import app.scene.common.web.RequestIdFilter;
import app.scene.support.PostgresTestcontainer;
import jakarta.servlet.http.Cookie;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Address limits (DEC-078 §2, #401). Public submits count every request per address; sign-in counts
 * failures per address only, so successes behind one Wi-Fi address are not blocked.
 */
@SpringBootTest(
    properties = {"scene.participant.submit-ip-limit=3", "scene.participant.ip-failure-limit=3"})
@Import(PostgresTestcontainer.class)
class ParticipantLimitsHttpIT {

  private static final String OPERATOR_COOKIE = "SCENE_SESSION";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";
  private static final String PIN = "730914";

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;
  @Autowired InMemoryRateLimiter limiter;
  @Autowired FailureLockout lockout;

  MockMvc mvc;

  @BeforeEach
  void mockMvc() {
    limiter.clear();
    lockout.clear();
    mvc =
        MockMvcBuilders.webAppContextSetup(context)
            .addFilters(
                context.getBean(RequestIdFilter.class),
                context.getBean(SessionRepositoryFilter.class))
            .apply(SecurityMockMvcConfigurers.springSecurity())
            .build();
  }

  @Test
  void repeatedSubmitsFromOneAddressAre429() throws Exception {
    Opened form = acceptingForm();
    for (int i = 1; i <= 3; i++) {
      mvc.perform(submit(form, "가" + i, "010-4000-000" + i, "10.0.0.1"))
          .andExpect(status().isCreated());
    }
    mvc.perform(submit(form, "가4", "010-4000-0004", "10.0.0.1"))
        .andExpect(status().isTooManyRequests())
        .andExpect(jsonPath("$.code").value("RATE_LIMITED"));
    assertThat(participants(form.eventId)).isEqualTo(3);
    mvc.perform(submit(form, "가4", "010-4000-0004", "10.0.0.2")).andExpect(status().isCreated());
  }

  @Test
  void failedSignInsFromOneAddressAre429AndSuccessesDoNotCount() throws Exception {
    Opened form = acceptingForm();
    mvc.perform(submit(form, "나", "010-4100-0001", "10.0.1.9")).andExpect(status().isCreated());
    for (int i = 0; i < 5; i++) {
      mvc.perform(signIn(form.eventId, "나", "010-4100-0001", PIN, "10.0.1.1"))
          .andExpect(status().isNoContent());
    }
    for (int i = 1; i <= 3; i++) {
      mvc.perform(signIn(form.eventId, "나", "010-4100-100" + i, PIN, "10.0.1.1"))
          .andExpect(status().isUnauthorized());
    }
    mvc.perform(signIn(form.eventId, "나", "010-4100-0001", PIN, "10.0.1.1"))
        .andExpect(status().isTooManyRequests())
        .andExpect(jsonPath("$.code").value("RATE_LIMITED"));
    mvc.perform(signIn(form.eventId, "나", "010-4100-0001", PIN, "10.0.1.2"))
        .andExpect(status().isNoContent());
  }

  private MockHttpServletRequestBuilder submit(
      Opened form, String name, String phone, String address) {
    String body =
        "{\"pin\":\""
            + PIN
            + "\",\"answers\":[{\"fieldId\":\""
            + form.nameId
            + "\",\"text\":\""
            + name
            + "\"},{\"fieldId\":\""
            + form.phoneId
            + "\",\"text\":\""
            + phone
            + "\"}]}";
    return post("/api/v1/public/events/" + form.eventId + "/forms/" + form.formId + "/applications")
        .with(
            request -> {
              request.setRemoteAddr(address);
              return request;
            })
        .cookie(csrf())
        .header(CSRF_HEADER, CSRF)
        .contentType(MediaType.APPLICATION_JSON)
        .content(body);
  }

  private static MockHttpServletRequestBuilder signIn(
      UUID eventId, String name, String phone, String pin, String address) {
    return post("/api/v1/public/events/" + eventId + "/participant-sessions")
        .with(
            request -> {
              request.setRemoteAddr(address);
              return request;
            })
        .cookie(csrf())
        .header(CSRF_HEADER, CSRF)
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"name\":\"" + name + "\",\"phone\":\"" + phone + "\",\"pin\":\"" + pin + "\"}");
  }

  private Opened acceptingForm() throws Exception {
    UUID spaceId = UUID.randomUUID();
    UUID memberId = UUID.randomUUID();
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, ?)", spaceId, "Home");
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, ?)", memberId, "Limit owner");
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
    UUID eventId =
        UUID.fromString(
            json.readTree(
                    body(
                        write(
                            post("/api/v1/operator/spaces/" + spaceId + "/events"),
                            owner,
                            "{\"name\":\"행사\"}"),
                        201))
                .get("eventId")
                .asString());
    JsonNode form =
        json.readTree(
            body(
                write(
                    post("/api/v1/operator/events/" + eventId + "/forms"),
                    owner,
                    "{\"customLabel\":\"식사\"}"),
                201));
    String formId = form.get("formId").asString();
    body(
        write(
            patch(
                "/api/v1/operator/events/"
                    + eventId
                    + "/forms/"
                    + formId
                    + "/fields/"
                    + form.get("fields").get(2).get("fieldId").asString()),
            owner,
            "{\"hidden\":true}"),
        200);
    body(
        write(
            post("/api/v1/operator/events/" + eventId + "/activate"),
            owner,
            "{\"expectedLifecycleVersion\":0}"),
        200);
    body(
        write(
            patch("/api/v1/operator/events/" + eventId + "/forms/" + formId),
            owner,
            "{\"acceptingApplications\":true}"),
        200);
    return new Opened(
        eventId,
        UUID.fromString(formId),
        UUID.fromString(form.get("fields").get(0).get("fieldId").asString()),
        UUID.fromString(form.get("fields").get(1).get("fieldId").asString()));
  }

  private String body(MockHttpServletRequestBuilder request, int status) throws Exception {
    return mvc.perform(request)
        .andExpect(status().is(status))
        .andReturn()
        .getResponse()
        .getContentAsString();
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

  private int participants(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM participants WHERE event_id = ?", Integer.class, eventId);
  }

  private record Opened(UUID eventId, UUID formId, UUID nameId, UUID phoneId) {}
}
