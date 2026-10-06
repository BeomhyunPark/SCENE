package app.scene.common.security;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;

class ChainSessionRegistryTest {

  @Test
  void cookieIsHttpOnlySecureAndSameSiteAndNotAConceptualName() {
    ChainSessionRegistry registry = new ChainSessionRegistry("placeholder-operator-session", "Lax");
    MockHttpServletResponse response = new MockHttpServletResponse();

    registry.establish(new ProbeAuthentication("operator"), response);

    String header = response.getHeader(HttpHeaders.SET_COOKIE);
    assertThat(header).startsWith("placeholder-operator-session=");
    assertThat(header).contains("HttpOnly");
    assertThat(header).contains("Secure");
    assertThat(header).contains("SameSite=Lax");
    assertThat(header).doesNotContain("Max-Age");
    assertThat(header).doesNotContain("Domain=");
    assertThat(header).doesNotContain("scene_operator_session");
    assertThat(header).doesNotContain("scene_participant_session");
  }

  @Test
  void operatorAndParticipantRegistriesDoNotReadEachOthersIds() {
    ChainSessionRegistry operator = new ChainSessionRegistry("placeholder-operator-session", "Lax");
    ChainSessionRegistry participant =
        new ChainSessionRegistry("placeholder-participant-session", "Lax");
    Cookie operatorCookie =
        operator.establish(new ProbeAuthentication("operator"), new MockHttpServletResponse());
    Cookie participantCookie =
        participant.establish(
            new ProbeAuthentication("participant"), new MockHttpServletResponse());

    assertThat(principal(operator, operatorCookie)).isEqualTo("operator");
    assertThat(principal(participant, participantCookie)).isEqualTo("participant");
    assertThat(principal(operator, copied(participant.cookieName(), operatorCookie.getValue())))
        .isNull();
    assertThat(principal(participant, copied(operator.cookieName(), participantCookie.getValue())))
        .isNull();
    assertThat(principal(participant, operatorCookie)).isNull();
    assertThat(principal(operator, participantCookie)).isNull();
  }

  private static String principal(ChainSessionRegistry registry, Cookie cookie) {
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setCookies(cookie);
    SecurityContext context = registry.load(request);
    Authentication authentication = context.getAuthentication();
    return authentication == null ? null : String.valueOf(authentication.getPrincipal());
  }

  private static Cookie copied(String name, String value) {
    return new Cookie(name, value);
  }
}
