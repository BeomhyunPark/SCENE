package app.scene.identity;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.stereotype.Component;

/**
 * After Google returns: replace the OAuth token with an {@link OperatorPrincipal} in the operator
 * session ({@code SCENE_SESSION}) and send the browser to {@code /login/done}, which continues to
 * the page the operator started from. Any problem goes back to
 * the login screen with a short code; no Google detail reaches the page or the log.
 */
@Component
public class GoogleSignInHandler
    implements AuthenticationSuccessHandler, AuthenticationFailureHandler {

  static final String SUCCESS = "/login/done";
  static final String FAILED = "/login?error=google";
  static final String UNVERIFIED = "/login?error=google_unverified";

  private static final Logger log = LoggerFactory.getLogger(GoogleSignInHandler.class);

  private final GoogleAccountService accounts;
  private final SecurityContextRepository contexts = new HttpSessionSecurityContextRepository();

  public GoogleSignInHandler(GoogleAccountService accounts) {
    this.accounts = accounts;
  }

  @Override
  public void onAuthenticationSuccess(
      HttpServletRequest request, HttpServletResponse response, Authentication authentication)
      throws IOException {
    if (!(authentication.getPrincipal() instanceof OidcUser user)) {
      signOut(request);
      response.sendRedirect(FAILED);
      return;
    }
    OperatorPrincipal principal;
    try {
      principal =
          accounts.signIn(
              user.getSubject(),
              user.getEmail(),
              Boolean.TRUE.equals(user.getEmailVerified()),
              user.getFullName());
    } catch (GoogleAccountService.UnverifiedEmail exception) {
      signOut(request);
      response.sendRedirect(UNVERIFIED);
      return;
    }
    request.changeSessionId();
    SecurityContext context = SecurityContextHolder.createEmptyContext();
    context.setAuthentication(
        UsernamePasswordAuthenticationToken.authenticated(
            principal, null, principal.getAuthorities()));
    SecurityContextHolder.setContext(context);
    contexts.saveContext(context, request, response);
    response.sendRedirect(SUCCESS);
  }

  @Override
  public void onAuthenticationFailure(
      HttpServletRequest request, HttpServletResponse response, AuthenticationException exception)
      throws IOException {
    log.warn("Google sign-in failed: {}", exception.getClass().getSimpleName());
    signOut(request);
    response.sendRedirect(FAILED);
  }

  private static void signOut(HttpServletRequest request) {
    SecurityContextHolder.clearContext();
    HttpSession session = request.getSession(false);
    if (session != null) {
      session.invalidate();
    }
  }
}
