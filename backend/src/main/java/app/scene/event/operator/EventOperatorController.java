package app.scene.event.operator;

import app.scene.common.web.ItemPage;
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
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/** Event operator collection. Permission rows and invitations stay on later routes. */
@RestController
public class EventOperatorController {

  private final OperatorPermissionService operators;

  public EventOperatorController(OperatorPermissionService operators) {
    this.operators = operators;
  }

  @GetMapping("/api/v1/operator/events/{eventId}/operators")
  ItemPage<ListedEventOperator> list(
      @PathVariable UUID eventId,
      @RequestParam(required = false) Integer page,
      @RequestParam(required = false) Integer size,
      @RequestParam(required = false) List<String> sort) {
    return operators.listOperators(actor(), eventId, page, size, sort);
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

  private static UUID actor() {
    return OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication())
        .userId();
  }
}
