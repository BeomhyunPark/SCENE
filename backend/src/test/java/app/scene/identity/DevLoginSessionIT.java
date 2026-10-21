package app.scene.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/** Development login on the test profile rotates the session id and sets SCENE_SESSION. */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class DevLoginSessionIT {

  private static final String OPERATOR_COOKIE = "SCENE_SESSION";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";
  private static final String LOGIN = "/api/v1/operator/auth/login";

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;

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
  void loginRotatesTheSessionIdAndSetsTheOperatorCookie() throws Exception {
    UUID userId = UUID.randomUUID();
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, 'Owner')", userId);

    MvcResult first = login(userId);
    String firstId = sessionCookie(first);
    assertThat(operatorSetCookie(first)).contains("HttpOnly", "Secure", "SameSite=Lax", "Path=/;");
    assertThat(operatorSetCookie(first)).doesNotContain("Path=/api");

    MvcResult second =
        mvc.perform(
                post(LOGIN)
                    .cookie(new Cookie(OPERATOR_COOKIE, firstId), csrf())
                    .header(CSRF_HEADER, CSRF)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"userId\":\"" + userId + "\"}"))
            .andExpect(status().isOk())
            .andReturn();
    String secondId = sessionCookie(second);
    assertThat(secondId).isNotEqualTo(firstId);

    mvc.perform(get("/api/v1/operator/me").cookie(new Cookie(OPERATOR_COOKIE, firstId)))
        .andExpect(status().isUnauthorized());
    mvc.perform(get("/api/v1/operator/me").cookie(new Cookie(OPERATOR_COOKIE, secondId)))
        .andExpect(status().isOk());
  }

  private MvcResult login(UUID userId) throws Exception {
    return mvc.perform(
            post(LOGIN)
                .cookie(csrf())
                .header(CSRF_HEADER, CSRF)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"userId\":\"" + userId + "\",\"email\":\"Owner@Example.com\"}"))
        .andExpect(status().isOk())
        .andReturn();
  }

  private static String sessionCookie(MvcResult result) {
    Cookie cookie = result.getResponse().getCookie(OPERATOR_COOKIE);
    assertThat(cookie).isNotNull();
    assertThat(cookie.isHttpOnly()).isTrue();
    assertThat(cookie.getSecure()).isTrue();
    assertThat(cookie.getPath()).isEqualTo("/");
    return cookie.getValue();
  }

  private static String operatorSetCookie(MvcResult result) {
    return result.getResponse().getHeaders("Set-Cookie").stream()
        .filter(header -> header.startsWith(OPERATOR_COOKIE + "="))
        .findFirst()
        .orElseThrow();
  }

  private static Cookie csrf() {
    return new Cookie(CSRF_COOKIE, CSRF);
  }
}
