package app.scene.event.task;

import app.scene.identity.OperatorPrincipal;
import java.util.UUID;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/**
 * Checklist progress commands. These routes do not read {@code Idempotency-Key}. Create, patch,
 * delete, list, and detail are separate routes.
 */
@RestController
public class TaskProgressController {

  private final OperatorTaskProgressService progress;

  public TaskProgressController(OperatorTaskProgressService progress) {
    this.progress = progress;
  }

  @PutMapping("/api/v1/operator/events/{eventId}/tasks/{taskId}/items/{itemId}")
  TaskStateResponse setChecked(
      @PathVariable UUID eventId,
      @PathVariable UUID taskId,
      @PathVariable UUID itemId,
      @RequestBody(required = false) JsonNode body) {
    return progress.setChecked(actor(), eventId, taskId, itemId, body);
  }

  @PostMapping("/api/v1/operator/events/{eventId}/tasks/{taskId}/complete")
  TaskStateResponse complete(
      @PathVariable UUID eventId,
      @PathVariable UUID taskId,
      @RequestBody(required = false) JsonNode body) {
    return progress.complete(actor(), eventId, taskId, body);
  }

  @PostMapping("/api/v1/operator/events/{eventId}/tasks/{taskId}/reopen")
  TaskStateResponse reopen(
      @PathVariable UUID eventId,
      @PathVariable UUID taskId,
      @RequestBody(required = false) JsonNode body) {
    return progress.reopen(actor(), eventId, taskId, body);
  }

  private static UUID actor() {
    return OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication())
        .userId();
  }
}
