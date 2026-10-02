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
  }

  @Test
  void sharedProfilesRequireEnvironmentAndNameNoHost() throws IOException {
    for (String profile : new String[] {"dev", "stg", "prod"}) {
      String text = read("application-" + profile + ".yml");
      assertThat(text).contains("${SCENE_DB_URL}");
      assertThat(text).contains("${SCENE_DB_USER}");
      assertThat(text).contains("${SCENE_DB_PASSWORD}");
      assertThat(text).doesNotContain("jdbc:");
      assertThat(text).doesNotContain("localhost");
    }
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
