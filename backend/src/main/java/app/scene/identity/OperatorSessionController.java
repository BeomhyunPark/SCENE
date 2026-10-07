package app.scene.identity;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Operator session routes. Participant login and domain management stay out of this slice. */
@RestController
public class OperatorSessionController {

  private final OperatorAccountRepository accounts;
  private final SecurityContextRepository securityContexts =
      new HttpSessionSecurityContextRepository();

  public OperatorSessionController(OperatorAccountRepository accounts) {
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
    OperatorPrincipal principal = new OperatorPrincipal(account.id(), account.displayName());
    Authentication authentication =
        UsernamePasswordAuthenticationToken.authenticated(
            principal, null, principal.getAuthorities());
    SecurityContext context = SecurityContextHolder.createEmptyContext();
    context.setAuthentication(authentication);
    SecurityContextHolder.setContext(context);
    securityContexts.saveContext(context, request, response);
    return new OperatorView(principal.userId(), principal.displayName());
  }

  @GetMapping("/api/v1/operator/me")
  OperatorView me() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication == null
        || !(authentication.getPrincipal() instanceof OperatorPrincipal principal)) {
      throw new SceneException(ErrorCode.AUTHENTICATION_REQUIRED);
    }
    return new OperatorView(principal.userId(), principal.displayName());
  }

  @PostMapping("/api/v1/operator/auth/logout")
  ResponseEntity<Void> logout(HttpServletRequest request) {
    HttpSession session = request.getSession(false);
    if (session != null) {
      session.invalidate();
    }
    SecurityContextHolder.clearContext();
    return ResponseEntity.noContent().build();
  }
}
