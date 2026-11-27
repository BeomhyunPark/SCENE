package app.scene.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.support.PostgresTestcontainer;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers;
import org.springframework.session.web.http.SessionRepositoryFilter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/**
 * Google sign-in (DEC-069). Own properties give this class its own context and an empty database,
 * so the bootstrap owner sees no space yet. Google itself is not called.
 */
@SpringBootTest(
    properties = {
      "scene.bootstrap.owner-email=Owner@Example.com",
      "scene.bootstrap.space-name=청년2부",
      "spring.security.oauth2.client.registration.google.client-id=test-client-id",
      "spring.security.oauth2.client.registration.google.client-secret=test-secret"
    })
@Import(PostgresTestcontainer.class)
class GoogleSignInIT {

  @Autowired GoogleAccountService accounts;
  @Autowired JdbcTemplate jdbc;
  @Autowired WebApplicationContext context;

  MockMvc mvc;

  @BeforeEach
  void mockMvc() {
    mvc =
        MockMvcBuilders.webAppContextSetup(context)
            .addFilters(context.getBean(SessionRepositoryFilter.class))
            .apply(SecurityMockMvcConfigurers.springSecurity())
            .build();
  }

  @Test
  void firstSignInCreatesTheUserAndTheBootstrapOwnerGetsOneSpace() {
    assertThatThrownBy(() -> accounts.signIn("sub-unverified", "a@example.com", false, "A"))
        .isInstanceOf(GoogleAccountService.UnverifiedEmail.class);
    assertThat(count("SELECT count(*) FROM user_google_identities")).isZero();

    OperatorPrincipal guest = accounts.signIn("sub-guest", "guest@example.com", true, "  손님  ");
    assertThat(guest.displayName()).isEqualTo("손님");
    assertThat(guest.email()).isEqualTo("guest@example.com");
    assertThat(count("SELECT count(*) FROM spaces")).isZero();

    OperatorPrincipal owner = accounts.signIn("sub-owner", " OWNER@example.com ", true, null);
    assertThat(owner.displayName()).isEqualTo("owner");
    assertThat(count("SELECT count(*) FROM spaces WHERE name = '청년2부'")).isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT role FROM members WHERE user_id = ? AND status = 'ACTIVE'",
                String.class,
                owner.userId()))
        .isEqualTo("OWNER");

    OperatorPrincipal again = accounts.signIn("sub-owner", "owner@example.com", true, "다른 이름");
    assertThat(again.userId()).isEqualTo(owner.userId());
    assertThat(again.displayName()).isEqualTo("owner");
    assertThat(count("SELECT count(*) FROM spaces")).isEqualTo(1);
    assertThat(count("SELECT count(*) FROM users WHERE id = '" + owner.userId() + "'"))
        .isEqualTo(1);

    OperatorPrincipal twin = accounts.signIn("sub-owner-2", "owner@example.com", true, "둘째");
    assertThat(twin.userId()).isNotEqualTo(owner.userId());
    assertThat(count("SELECT count(*) FROM spaces")).isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM members WHERE user_id = ?", Integer.class, twin.userId()))
        .isZero();
    assertThat(UUID.fromString(guest.userId().toString())).isNotNull();
  }

  @Test
  void signInStartsAtGoogleWithThisAppsCallbackAndAStateInTheSession() throws Exception {
    MvcResult result =
        mvc.perform(get("/oauth2/authorization/google"))
            .andExpect(status().is3xxRedirection())
            .andReturn();
    String location = result.getResponse().getHeader("Location");
    assertThat(location)
        .startsWith("https://accounts.google.com/o/oauth2/v2/auth")
        .contains("client_id=test-client-id")
        .contains("scope=openid%20email%20profile")
        .contains("redirect_uri=http://localhost/login/oauth2/code/google")
        .contains("state=")
        .contains("prompt=select_account");
    assertThat(result.getResponse().getHeaders("Set-Cookie"))
        .anyMatch(cookie -> cookie.startsWith("SCENE_SESSION="));
  }

  @Test
  void aCallbackWithoutAStartedSignInGoesBackToLogin() throws Exception {
    mvc.perform(get("/login/oauth2/code/google").param("code", "x").param("state", "y"))
        .andExpect(status().is3xxRedirection())
        .andExpect(header().string("Location", "/login?error=google"));
  }

  private int count(String sql) {
    return jdbc.queryForObject(sql, Integer.class);
  }
}
