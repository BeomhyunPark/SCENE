package app.scene.space;

import app.scene.common.tenant.OperatorAccess;
import app.scene.common.tenant.OperatorSpaceView;
import app.scene.identity.OperatorPrincipal;
import java.util.UUID;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * Proves a space-scoped call after leave. Organization settings and operator management stay out.
 */
@RestController
public class OperatorSpaceController {

  private final OperatorAccess access;

  public OperatorSpaceController(OperatorAccess access) {
    this.access = access;
  }

  @GetMapping("/api/v1/operator/spaces/{spaceId}")
  OperatorSpaceView read(@PathVariable UUID spaceId) {
    OperatorPrincipal principal =
        OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication());
    return access.readSpace(principal.userId(), spaceId);
  }
}
