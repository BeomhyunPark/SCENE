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
    assertThatThrownBy(() -> session("scene_operator_session", "SCENE_PSESSION"))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("not approved");
    assertThatThrownBy(() -> session("SCENE_SESSION", "scene_participant_session"))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("not approved");
  }

  @Test
  void acceptsTheDecidedCookieNames() {
    SecurityProperties.Session session = session("SCENE_SESSION", "SCENE_PSESSION");
    assertThat(session.operatorCookieName()).isEqualTo("SCENE_SESSION");
    assertThat(session.participantCookieName()).isEqualTo("SCENE_PSESSION");
    assertThat(session.sameSite()).isEqualTo("Lax");
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
