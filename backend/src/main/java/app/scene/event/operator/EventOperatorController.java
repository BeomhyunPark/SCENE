package app.scene.event.operator;

import app.scene.event.permission.OperatorPermissionBody;
import app.scene.event.permission.OperatorPermissionService;
import app.scene.identity.OperatorPrincipal;
import app.scene.space.ListedEventOperator;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/** Event operator collection and per-operator permission overrides. */
@RestController
public class EventOperatorController {

  private final OperatorPermissionService operators;

  public EventOperatorController(OperatorPermissionService operators) {
    this.operators = operators;
  }

  @GetMapping("/api/v1/operator/events/{eventId}/operators")
  Object list(
      @PathVariable UUID eventId,
      @RequestParam(required = false) Integer page,
      @RequestParam(required = false) Integer size,
      @RequestParam(required = false) List<String> sort,
      @RequestParam(required = false) String include) {
    return operators.listOperators(actor(), eventId, page, size, sort, include);
  }

  @GetMapping("/api/v1/operator/events/{eventId}/operators/{userId}")
  ListedEventOperator get(@PathVariable UUID eventId, @PathVariable UUID userId) {
    return operators.getOperator(actor(), eventId, userId);
  }

  @PostMapping("/api/v1/operator/events/{eventId}/operators")
  ListedEventOperator add(@PathVariable UUID eventId, @RequestBody JsonNode body) {
    return operators.addOperator(actor(), eventId, body);
  }

  @PatchMapping("/api/v1/operator/events/{eventId}/operators/{userId}")
  ListedEventOperator changeRole(
      @PathVariable UUID eventId, @PathVariable UUID userId, @RequestBody JsonNode body) {
    return operators.changeOperatorRole(actor(), eventId, userId, body);
  }

  @DeleteMapping("/api/v1/operator/events/{eventId}/operators/{userId}")
  void remove(@PathVariable UUID eventId, @PathVariable UUID userId) {
    operators.removeOperator(actor(), eventId, userId);
  }

  @GetMapping("/api/v1/operator/events/{eventId}/operators/{userId}/permissions")
  OperatorPermissionBody readPermissions(@PathVariable UUID eventId, @PathVariable UUID userId) {
    return operators.readOperatorPermissions(actor(), eventId, userId);
  }

  @PutMapping("/api/v1/operator/events/{eventId}/operators/{userId}/permissions")
  OperatorPermissionBody replacePermissions(
      @PathVariable UUID eventId, @PathVariable UUID userId, @RequestBody JsonNode body) {
    return operators.replaceOperatorPermissions(actor(), eventId, userId, body);
  }

  private static UUID actor() {
    return OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication())
        .userId();
  }
}
