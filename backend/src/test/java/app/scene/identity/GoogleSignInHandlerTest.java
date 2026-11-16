package app.scene.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;

/** The handler swaps Google's token for an operator session and never leaks Google detail. */
class GoogleSignInHandlerTest {

  private final GoogleAccountService accounts = mock(GoogleAccountService.class);
  private final GoogleSignInHandler handler = new GoogleSignInHandler(accounts);

  @AfterEach
  void clear() {
    SecurityContextHolder.clearContext();
  }

  @Test
  void successStoresAnOperatorPrincipalAndFinishesOnTheLoginDonePage() throws Exception {
    UUID userId = UUID.randomUUID();
    when(accounts.signIn("sub-1", "kim@example.com", true, "김"))
        .thenReturn(new OperatorPrincipal(userId, "김", "kim@example.com"));
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.getSession(true);
    MockHttpServletResponse response = new MockHttpServletResponse();

    handler.onAuthenticationSuccess(request, response, token(true));

    assertThat(response.getRedirectedUrl()).isEqualTo("/login/done");
    SecurityContext stored =
        (SecurityContext)
            request
                .getSession(false)
                .getAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY);
    OperatorPrincipal principal = (OperatorPrincipal) stored.getAuthentication().getPrincipal();
    assertThat(principal.userId()).isEqualTo(userId);
    assertThat(principal.email()).isEqualTo("kim@example.com");
  }

  @Test
  void unverifiedEmailGoesBackToLoginSignedOut() throws Exception {
    when(accounts.signIn(any(), any(), org.mockito.ArgumentMatchers.eq(false), any()))
        .thenThrow(new GoogleAccountService.UnverifiedEmail());
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.getSession(true);
    MockHttpServletResponse response = new MockHttpServletResponse();

    handler.onAuthenticationSuccess(request, response, token(false));

    assertThat(response.getRedirectedUrl()).isEqualTo("/login?error=google_unverified");
    assertThat(request.getSession(false)).isNull();
  }

  @Test
  void failureGoesBackToLogin() throws Exception {
    MockHttpServletResponse response = new MockHttpServletResponse();
    handler.onAuthenticationFailure(
        new MockHttpServletRequest(), response, new BadCredentialsException("google said no"));
    assertThat(response.getRedirectedUrl()).isEqualTo("/login?error=google");
    assertThat(response.getContentAsString()).doesNotContain("google said no");
  }

  private static OAuth2AuthenticationToken token(boolean verified) {
    Instant now = Instant.now();
    OidcIdToken idToken =
        new OidcIdToken(
            "id-token",
            now,
            now.plusSeconds(60),
            Map.of(
                "sub", "sub-1",
                "email", "kim@example.com",
                "email_verified", verified,
                "name", "김"));
    DefaultOidcUser user = new DefaultOidcUser(List.of(), idToken);
    return new OAuth2AuthenticationToken(user, List.of(), "google");
  }
}
