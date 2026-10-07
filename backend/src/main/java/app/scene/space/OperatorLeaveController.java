package app.scene.space;

import app.scene.identity.OperatorPrincipal;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/**
 * DEC-063 leave routes. The confirmed section names these paths and the leave body. It does not
 * name a preview body. Draft event fields that are not on {@link OperatedEvent} stay off the
 * preview. There is no event leave route.
 */
@RestController
public class OperatorLeaveController {

  private final OperatorLeaveService leave;

  public OperatorLeaveController(OperatorLeaveService leave) {
    this.leave = leave;
  }

  @GetMapping("/api/v1/operator/spaces/{spaceId}/me/leave-preview")
  Map<String, Object> preview(@PathVariable UUID spaceId) {
    return leave.preview(actor(), spaceId);
  }

  @PostMapping("/api/v1/operator/spaces/{spaceId}/me/leave")
  ResponseEntity<Void> leave(
      @PathVariable UUID spaceId, @RequestBody(required = false) JsonNode body) {
    leave.leave(actor(), spaceId, body);
    return ResponseEntity.ok().build();
  }

  private static UUID actor() {
    return OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication())
        .userId();
  }
}
