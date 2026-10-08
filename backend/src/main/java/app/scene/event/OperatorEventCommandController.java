package app.scene.event;

import app.scene.common.web.ItemPage;
import app.scene.identity.OperatorPrincipal;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/**
 * Event create, list, and name patch. Create is 201 with no {@code Location} header. These routes
 * do not read {@code Idempotency-Key}. The space-path access probe stays on {@link
 * OperatorEventController}.
 */
@RestController
public class OperatorEventCommandController {

  private final OperatorEventCommandService events;

  public OperatorEventCommandController(OperatorEventCommandService events) {
    this.events = events;
  }

  @PostMapping("/api/v1/operator/spaces/{spaceId}/events")
  ResponseEntity<EventDetail> create(
      @PathVariable UUID spaceId, @RequestBody(required = false) JsonNode body) {
    return ResponseEntity.status(HttpStatus.CREATED).body(events.create(actor(), spaceId, body));
  }

  @GetMapping("/api/v1/operator/spaces/{spaceId}/events")
  ItemPage<EventListItem> list(
      @PathVariable UUID spaceId,
      @RequestParam(required = false) Integer page,
      @RequestParam(required = false) Integer size,
      @RequestParam(required = false) List<String> sort) {
    return events.list(actor(), spaceId, page, size, sort);
  }

  @GetMapping("/api/v1/operator/events/{eventId}")
  EventDetail read(@PathVariable UUID eventId) {
    return events.read(actor(), eventId);
  }

  @PatchMapping("/api/v1/operator/events/{eventId}")
  EventDetail patch(@PathVariable UUID eventId, @RequestBody(required = false) JsonNode body) {
    return events.rename(actor(), eventId, body);
  }

  private static UUID actor() {
    return OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication())
        .userId();
  }
}
