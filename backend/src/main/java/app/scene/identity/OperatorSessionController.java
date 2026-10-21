package app.scene.identity;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Operator session read and logout. These exist on every profile. Development login is {@link
 * DevLoginController}.
 */
@RestController
public class OperatorSessionController {

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
