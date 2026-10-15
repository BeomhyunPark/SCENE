package app.scene.space;

import app.scene.common.tenant.OperatorAccess;
import app.scene.common.tenant.OperatorSpaceView;
import app.scene.common.web.ItemPage;
import app.scene.identity.OperatorPrincipal;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Proves a space-scoped call after leave. Organization settings and operator management stay out.
 */
@RestController
public class OperatorSpaceController {

  private final OperatorAccess access;
  private final OperatorSpaceListService spaces;

  public OperatorSpaceController(OperatorAccess access, OperatorSpaceListService spaces) {
    this.access = access;
    this.spaces = spaces;
  }

  @GetMapping("/api/v1/operator/spaces")
  ItemPage<SpaceListItem> list(
      @RequestParam(required = false) Integer page,
      @RequestParam(required = false) Integer size,
      @RequestParam(required = false) List<String> sort) {
    return spaces.list(actor(), page, size, sort);
  }

  @GetMapping("/api/v1/operator/spaces/{spaceId}")
  OperatorSpaceView read(@PathVariable UUID spaceId) {
    return access.readSpace(actor(), spaceId);
  }

  private static UUID actor() {
    return OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication())
        .userId();
  }
}
