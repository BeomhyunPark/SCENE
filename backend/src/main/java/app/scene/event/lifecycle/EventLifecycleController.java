package app.scene.event.lifecycle;

import app.scene.common.web.ItemPage;
import app.scene.identity.OperatorPrincipal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/** DEC-063 lifecycle reads and commands. Owner transfer and leave stay out. */
@RestController
public class EventLifecycleController {

  private final OperatorLifecycleService lifecycle;

  public EventLifecycleController(OperatorLifecycleService lifecycle) {
    this.lifecycle = lifecycle;
  }

  @GetMapping("/api/v1/operator/events/{eventId}/lifecycle")
  Map<String, Object> read(@PathVariable UUID eventId) {
    return lifecycle.read(actor(), eventId);
  }

  @GetMapping("/api/v1/operator/events/{eventId}/lifecycle/transitions")
  ItemPage<LifecycleTransitionItem> transitions(
      @PathVariable UUID eventId,
      @RequestParam(required = false) Integer page,
      @RequestParam(required = false) Integer size,
      @RequestParam(required = false) List<String> sort) {
    return lifecycle.transitions(actor(), eventId, page, size, sort);
  }

  @PostMapping("/api/v1/operator/events/{eventId}/activate")
  LifecycleResult activate(
      @PathVariable UUID eventId, @RequestBody(required = false) JsonNode body) {
    return lifecycle.activate(actor(), eventId, body);
  }

  @PostMapping("/api/v1/operator/events/{eventId}/end")
  LifecycleResult end(@PathVariable UUID eventId, @RequestBody(required = false) JsonNode body) {
    return lifecycle.end(actor(), eventId, body);
  }

  @PostMapping("/api/v1/operator/events/{eventId}/reopen")
  LifecycleResult reopen(@PathVariable UUID eventId, @RequestBody(required = false) JsonNode body) {
    return lifecycle.reopen(actor(), eventId, body);
  }

  @PostMapping("/api/v1/operator/events/{eventId}/archive")
  LifecycleResult archive(
      @PathVariable UUID eventId, @RequestBody(required = false) JsonNode body) {
    return lifecycle.archive(actor(), eventId, body);
  }

  @PostMapping("/api/v1/operator/events/{eventId}/unarchive")
  LifecycleResult unarchive(
      @PathVariable UUID eventId, @RequestBody(required = false) JsonNode body) {
    return lifecycle.unarchive(actor(), eventId, body);
  }

  private static UUID actor() {
    return OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication())
        .userId();
  }
}
