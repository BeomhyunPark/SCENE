package app.scene.common.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class SecurityPropertiesTest {

  @Test
  void splitsAndTrimsOriginsAndTreatsBlankAsNone() {
    assertThat(new SecurityProperties.Cors("").origins()).isEmpty();
    assertThat(new SecurityProperties.Cors("  ").origins()).isEmpty();
    assertThat(
            new SecurityProperties.Cors(
                    " http://scene-frontend.placeholder.invalid , http://other.placeholder.invalid ")
                .origins())
        .containsExactly(
            "http://scene-frontend.placeholder.invalid", "http://other.placeholder.invalid");
  }

  @Test
  void rejectsAWildcardOrigin() {
    assertThatThrownBy(() -> new SecurityProperties.Cors("*").origins())
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void rejectsConceptualCookieNames() {
    assertThatThrownBy(() -> session("scene_operator_session", "placeholder-participant-session"))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("not approved");
    assertThatThrownBy(() -> session("placeholder-operator-session", "scene_participant_session"))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("not approved");
  }

  @Test
  void requiresDistinctPlaceholderCookieNames() {
    assertThatThrownBy(() -> session("placeholder-session", "placeholder-session"))
        .isInstanceOf(IllegalArgumentException.class);
  }

  private static SecurityProperties.Session session(String operator, String participant) {
    return new SecurityProperties.Session(operator, participant, "Lax");
  }
}
