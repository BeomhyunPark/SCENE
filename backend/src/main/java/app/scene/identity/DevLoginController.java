package app.scene.identity;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.util.Locale;
import org.springframework.context.annotation.Profile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Development login. The route exists only on the {@code local} and {@code test} profiles. There is
 * no property that turns it on. This is the only writer of {@link OperatorPrincipal}'s verified
 * email.
 */
@Profile({"local", "test"})
@RestController
public class DevLoginController {

  private final OperatorAccountRepository accounts;
  private final SecurityContextRepository securityContexts =
      new HttpSessionSecurityContextRepository();

  public DevLoginController(OperatorAccountRepository accounts) {
    this.accounts = accounts;
  }

  @PostMapping("/api/v1/operator/auth/login")
  OperatorView login(
      @Valid @RequestBody OperatorLoginRequest body,
      HttpServletRequest request,
      HttpServletResponse response) {
    OperatorAccount account =
        accounts
            .findById(body.userId())
            .orElseThrow(() -> new SceneException(ErrorCode.AUTHENTICATION_REQUIRED));
    request.getSession();
    request.changeSessionId();
    OperatorPrincipal principal =
        new OperatorPrincipal(account.id(), account.displayName(), sessionEmail(body.email()));
    Authentication authentication =
        UsernamePasswordAuthenticationToken.authenticated(
            principal, null, principal.getAuthorities());
    SecurityContext context = SecurityContextHolder.createEmptyContext();
    context.setAuthentication(authentication);
    SecurityContextHolder.setContext(context);
    securityContexts.saveContext(context, request, response);
    return new OperatorView(principal.userId(), principal.displayName());
  }

  /** Blank becomes absent. The value is not logged and is not part of {@link OperatorView}. */
  private static String sessionEmail(String raw) {
    if (raw == null) {
      return null;
    }
    String email = raw.trim().toLowerCase(Locale.ROOT);
    return email.isEmpty() ? null : email;
  }
}
