package app.scene.event.task;

import app.scene.common.web.ItemPage;
import app.scene.identity.OperatorPrincipal;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/**
 * Task list, detail, create, patch, and delete. Create is 201 because the shared HTTP table uses
 * 201 for a create. Delete is 204 with no body: the task section names the route and {@code
 * TASK_WRITE} and does not name a success body. These routes do not read {@code Idempotency-Key}.
 * Proposed list filters are not applied. Progress routes stay on {@link TaskProgressController}.
 */
@RestController
public class TaskCommandController {

  private final OperatorTaskCommandService commands;

  public TaskCommandController(OperatorTaskCommandService commands) {
    this.commands = commands;
  }

  @GetMapping("/api/v1/operator/events/{eventId}/tasks")
  ItemPage<TaskListItem> list(
      @PathVariable UUID eventId,
      @RequestParam(required = false) Integer page,
      @RequestParam(required = false) Integer size,
      @RequestParam(required = false) List<String> sort) {
    return commands.list(actor(), eventId, page, size, sort);
  }

  @PostMapping("/api/v1/operator/events/{eventId}/tasks")
  ResponseEntity<TaskCommandResponse> create(
      @PathVariable UUID eventId, @RequestBody(required = false) JsonNode body) {
    return ResponseEntity.status(HttpStatus.CREATED).body(commands.create(actor(), eventId, body));
  }

  @GetMapping("/api/v1/operator/events/{eventId}/tasks/{taskId}")
  TaskCommandResponse detail(@PathVariable UUID eventId, @PathVariable UUID taskId) {
    return commands.detail(actor(), eventId, taskId);
  }

  @PatchMapping("/api/v1/operator/events/{eventId}/tasks/{taskId}")
  TaskCommandResponse patch(
      @PathVariable UUID eventId,
      @PathVariable UUID taskId,
      @RequestBody(required = false) JsonNode body) {
    return commands.patch(actor(), eventId, taskId, body);
  }

  @DeleteMapping("/api/v1/operator/events/{eventId}/tasks/{taskId}")
  ResponseEntity<Void> delete(@PathVariable UUID eventId, @PathVariable UUID taskId) {
    commands.delete(actor(), eventId, taskId);
    return ResponseEntity.noContent().build();
  }

  private static UUID actor() {
    return OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication())
        .userId();
  }
}
