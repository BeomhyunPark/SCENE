package app.scene.event.form;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.web.RequestIdFilter;
import app.scene.support.PostgresTestcontainer;
import jakarta.servlet.http.Cookie;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
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
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Public form field list. A closed form returns {@code FORM_CLOSED} and no fields. Submit stays
 * available. No participant session route is registered.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class PublicFormReadHttpIT {

  private static final String OPERATOR_COOKIE = "placeholder-operator-session";
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
  void closedFormHasNoFieldsAndAnOpenFormListsThemInPositionOrder() throws Exception {
    Held event = openEvent("Form owner");
    Opened form = createForm(event);

    String closed =
        problem(publicForm(form.eventId, form.formId, "req-closed"), 409, "FORM_CLOSED");
    assertThat(closed).doesNotContain("fieldId", "이름", "전화", "식사", "accessKey");
    problem(publicForm(form.eventId, UUID.randomUUID(), "req-missing-form"), 404, "FORM_NOT_FOUND");
    problem(
        publicForm(UUID.randomUUID(), form.formId, "req-missing-event"), 404, "RESOURCE_NOT_FOUND");
    assertThat(applicationCount(form.eventId)).isZero();

    ok(
        write(
            post("/api/v1/operator/events/" + form.eventId + "/activate"),
            event.owner,
            "{\"expectedLifecycleVersion\":0}",
            "req-activate"));
    ok(
        write(
            patch("/api/v1/operator/events/" + form.eventId + "/forms/" + form.formId),
            event.owner,
            "{\"acceptingApplications\":true}",
            "req-open"));

    String listed = ok(publicForm(form.eventId, form.formId, "req-get"));
    JsonNode body = json.readTree(listed);
    assertThat(body.propertyNames()).containsExactly("formId", "fields");
    assertThat(body.get("formId").asString()).isEqualTo(form.formId.toString());
    assertThat(body.get("fields")).hasSize(3);
    assertField(body.get("fields").get(0), "SYSTEM", "NAME", "이름", 0);
    assertField(body.get("fields").get(1), "SYSTEM", "PHONE", "전화", 1);
    assertField(body.get("fields").get(2), "CUSTOM", null, "식사", 2);
    assertThat(listed)
        .doesNotContain("acceptingApplications", "answers", "accessKey", "이름답", "010");

    String submitted =
        mvc.perform(
                post("/api/v1/public/events/"
                        + form.eventId
                        + "/forms/"
                        + form.formId
                        + "/applications")
                    .cookie(csrf())
                    .header(CSRF_HEADER, CSRF)
                    .header("X-Request-Id", "req-submit")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(answers(form.nameId, "이름답", form.phoneId, "010-1234-5678")))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    assertThat(applicationCount(form.eventId)).isEqualTo(1);
    assertThat(json.readTree(submitted).get("accessKey").asString()).isNotBlank();
    String again = ok(publicForm(form.eventId, form.formId, "req-get-again"));
    assertThat(again)
        .doesNotContain(
            "이름답", "010-1234-5678", json.readTree(submitted).get("accessKey").asString());
  }

  @Test
  void participantSessionRouteIsNotAdded() {
    for (RequestMappingInfo info : handlers.getHandlerMethods().keySet()) {
      for (String pattern : info.getPatternValues()) {
        assertThat(pattern).doesNotContain("participant-sessions");
      }
    }
  }

  private void assertField(
      JsonNode field, String kind, String systemKey, String label, int position) {
    assertThat(field.propertyNames())
        .containsExactly("fieldId", "kind", "systemKey", "label", "position");
    assertThat(field.get("kind").asString()).isEqualTo(kind);
    if (systemKey == null) {
      assertThat(field.get("systemKey").isNull()).isTrue();
    } else {
      assertThat(field.get("systemKey").asString()).isEqualTo(systemKey);
    }
    assertThat(field.get("label").asString()).isEqualTo(label);
    assertThat(field.get("position").asInt()).isEqualTo(position);
  }

  private MockHttpServletRequestBuilder publicForm(UUID eventId, UUID formId, String requestId) {
    return get("/api/v1/public/events/" + eventId + "/forms/" + formId)
        .header("X-Request-Id", requestId);
  }

  private String answers(UUID nameId, String name, UUID phoneId, String phone) {
    return "{\"answers\":["
        + "{\"fieldId\":\""
        + nameId
        + "\",\"text\":\""
        + name
        + "\"},"
        + "{\"fieldId\":\""
        + phoneId
        + "\",\"text\":\""
        + phone
        + "\"}]}";
  }

  private String ok(MockHttpServletRequestBuilder request) throws Exception {
    return mvc.perform(request)
        .andExpect(status().isOk())
        .andReturn()
        .getResponse()
        .getContentAsString();
  }

  private String problem(MockHttpServletRequestBuilder request, int httpStatus, String code)
      throws Exception {
    return mvc.perform(request)
        .andExpect(status().is(httpStatus))
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.code").value(code))
        .andReturn()
        .getResponse()
        .getContentAsString();
  }

  private static MockHttpServletRequestBuilder write(
      MockHttpServletRequestBuilder request, Cookie session, String body, String requestId) {
    return request
        .cookie(session, csrf())
        .header(CSRF_HEADER, CSRF)
        .header("X-Request-Id", requestId)
        .contentType(MediaType.APPLICATION_JSON)
        .content(body);
  }

  private Opened createForm(Held event) throws Exception {
    String created =
        mvc.perform(
                write(
                    post("/api/v1/operator/events/" + event.eventId + "/forms"),
                    event.owner,
                    "{\"customLabel\":\"식사\"}",
                    "req-form"))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    JsonNode body = json.readTree(created);
    return new Opened(
        event.eventId,
        UUID.fromString(body.get("formId").asString()),
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
                    "{\"name\":\"행사\"}",
                    "req-" + memberName))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    return new Held(UUID.fromString(json.readTree(created).get("eventId").asString()), owner);
  }

  private static Cookie csrf() {
    return new Cookie(CSRF_COOKIE, CSRF);
  }

  private int applicationCount(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM applications WHERE event_id = ?", Integer.class, eventId);
  }

  private record Held(UUID eventId, Cookie owner) {}

  private record Opened(UUID eventId, UUID formId, UUID nameId, UUID phoneId) {}
}
