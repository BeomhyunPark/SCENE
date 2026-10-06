package app.scene;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.DisabledIfEnvironmentVariable;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.core.io.ClassPathResource;

/** Profile files stay placeholders until hosting is decided. */
class ProfileFilesTest {

  @Test
  void localProfilePointsAtComposePostgres() throws IOException {
    String text = read("application-local.yml");
    assertThat(text).contains("jdbc:postgresql://localhost:5432/scene");
    assertThat(text).contains("username: scene");
    assertThat(text).contains("password: scene");
    assertThat(text).contains("classpath:db/migration,classpath:db/seed");
  }

  @Test
  void sharedProfilesRequireEnvironmentAndNameNoHost() throws IOException {
    for (String profile : new String[] {"dev", "stg", "prod"}) {
      String text = read("application-" + profile + ".yml");
      assertThat(text).contains("${SCENE_DB_URL}");
      assertThat(text).contains("${SCENE_DB_USER}");
      assertThat(text).contains("${SCENE_DB_PASSWORD}");
      assertThat(text).contains("${SCENE_CORS_ALLOWED_ORIGINS:}");
      assertThat(text).doesNotContain("jdbc:");
      assertThat(text).doesNotContain("localhost");
      assertThat(text).doesNotContain("db/seed");
      assertThat(text).doesNotContain("https://");
      assertThat(text).doesNotContain("scene-frontend.placeholder.invalid");
    }
  }

  @Test
  void defaultSecurityPlaceholdersAreNotConceptualNamesOrAProductionOrigin() throws IOException {
    String text = read("application.yml");
    assertThat(text).contains("http://scene-frontend.placeholder.invalid");
    assertThat(text).contains("placeholder-operator-session");
    assertThat(text).contains("placeholder-participant-session");
    assertThat(text).doesNotContain("operator-cookie-name: scene_operator_session");
    assertThat(text).doesNotContain("participant-cookie-name: scene_participant_session");
  }

  @Test
  @DisabledIfEnvironmentVariable(named = "SCENE_DB_URL", matches = ".+")
  void devProfileDoesNotStartWithoutDatabaseEnvironment() {
    assertThatThrownBy(
            () ->
                new SpringApplicationBuilder(SceneApplication.class)
                    .web(WebApplicationType.NONE)
                    .profiles("dev")
                    .run())
        .hasStackTraceContaining("must start with \"jdbc\"");
  }

  private static String read(String name) throws IOException {
    return new ClassPathResource(name).getContentAsString(StandardCharsets.UTF_8);
  }
}
