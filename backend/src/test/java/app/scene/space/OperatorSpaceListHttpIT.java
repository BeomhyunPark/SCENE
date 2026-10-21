package app.scene.space;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Active memberships of the caller, ordered by space name then id. */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class OperatorSpaceListHttpIT {

  private static final String PATH = "/api/v1/operator/spaces";
  private static final String OPERATOR_COOKIE = "SCENE_SESSION";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";

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
  void anonymousListIsUnauthorized() throws Exception {
    mvc.perform(get(PATH).header("X-Request-Id", "req-anon"))
        .andExpect(status().isUnauthorized())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"))
        .andExpect(jsonPath("$.traceId").value("req-anon"));
  }

  @Test
  void listsActiveMembershipsByNameAndRole() throws Exception {
    UUID userId = user("Caller");
    UUID alpha = space("Alpha");
    UUID bravo = space("Bravo");
    member(alpha, userId, "MEMBER");
    member(bravo, userId, "ADMIN");
    UUID left = space("Aardvark");
    member(left, userId, "OWNER");
    jdbc.update(
        "UPDATE members SET status = 'LEFT' WHERE space_id = ? AND user_id = ?", left, userId);
    UUID hidden = space("Hidden");
    member(hidden, user("Someone else"), "OWNER");
    Cookie session = login(userId);

    JsonNode body = json.readTree(ok(session, PATH, "req-list"));
    assertThat(body.propertyNames()).containsExactly("items", "page");
    assertThat(body.get("page").get("number").asInt()).isZero();
    assertThat(body.get("page").get("size").asInt()).isEqualTo(50);
    assertThat(body.get("page").get("totalItems").asInt()).isEqualTo(2);
    assertThat(body.get("page").get("totalPages").asInt()).isEqualTo(1);
    assertThat(body.get("items")).hasSize(2);
    JsonNode first = body.get("items").get(0);
    JsonNode second = body.get("items").get(1);
    assertThat(first.propertyNames()).containsExactly("spaceId", "name", "role");
    assertThat(first.get("spaceId").asString()).isEqualTo(alpha.toString());
    assertThat(first.get("name").asString()).isEqualTo("Alpha");
    assertThat(first.get("role").asString()).isEqualTo("MEMBER");
    assertThat(second.get("spaceId").asString()).isEqualTo(bravo.toString());
    assertThat(second.get("name").asString()).isEqualTo("Bravo");
    assertThat(second.get("role").asString()).isEqualTo("ADMIN");
    assertThat(body.toString())
        .doesNotContain(left.toString(), hidden.toString(), "Aardvark", "Hidden");
  }

  @Test
  void emptyMembershipIsAnEmptyPage() throws Exception {
    Cookie session = login(user("Nobody"));

    JsonNode body = json.readTree(ok(session, PATH, "req-empty"));
    assertThat(body.get("items")).isEmpty();
    assertThat(body.get("page").get("totalItems").asInt()).isZero();
    assertThat(body.get("page").get("totalPages").asInt()).isZero();
  }

  @Test
  void rejectsOversizedPageAndSort() throws Exception {
    Cookie session = login(user("Caller"));

    mvc.perform(get(PATH + "?size=101").cookie(session).header("X-Request-Id", "req-size"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("PAGE_SIZE_EXCEEDED"))
        .andExpect(jsonPath("$.traceId").value("req-size"));

    String problem =
        mvc.perform(get(PATH + "?sort=name,asc").cookie(session).header("X-Request-Id", "req-sort"))
            .andExpect(status().isBadRequest())
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
            .andExpect(jsonPath("$.traceId").value("req-sort"))
            .andReturn()
            .getResponse()
            .getContentAsString();
    JsonNode errors = json.readTree(problem).get("errors");
    assertThat(errors).hasSize(1);
    assertThat(errors.get(0).get("field").asString()).isEqualTo("sort");
  }

  private String ok(Cookie session, String path, String requestId) throws Exception {
    return mvc.perform(get(path).cookie(session).header("X-Request-Id", requestId))
        .andExpect(status().isOk())
        .andExpect(header().string("X-Request-Id", requestId))
        .andReturn()
        .getResponse()
        .getContentAsString();
  }

  private Cookie login(UUID userId) throws Exception {
    Cookie cookie =
        mvc.perform(
                post("/api/v1/operator/auth/login")
                    .cookie(new Cookie(CSRF_COOKIE, CSRF))
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

  private UUID space(String name) {
    UUID id = UUID.randomUUID();
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, ?)", id, name);
    return id;
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
}
