package app.scene.event.schedule;

import app.scene.event.schedule.ScheduleResponses.Board;
import app.scene.event.schedule.ScheduleResponses.ItemDeleted;
import app.scene.event.schedule.ScheduleResponses.ItemWritten;
import app.scene.event.schedule.ScheduleResponses.PublishResult;
import app.scene.event.schedule.ScheduleResponses.Published;
import app.scene.identity.OperatorPrincipal;
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
 * Operator schedule: working copy, item writes, publication and the published view (api.md "일정표").
 * The participant view is {@link ParticipantScheduleController}.
 */
@RestController
public class ScheduleController {

  private static final String BASE = "/api/v1/operator/events/{eventId}/schedule";

  private final ScheduleService schedule;

  public ScheduleController(ScheduleService schedule) {
    this.schedule = schedule;
  }

  @GetMapping(BASE)
  Board board(@PathVariable UUID eventId) {
    return schedule.board(actor(), eventId);
  }

  @PostMapping(BASE + "/items")
  ResponseEntity<ItemWritten> create(
      @PathVariable UUID eventId, @RequestBody(required = false) JsonNode body) {
    return ResponseEntity.status(HttpStatus.CREATED).body(schedule.create(actor(), eventId, body));
  }

  @PatchMapping(BASE + "/items/{itemId}")
  ItemWritten update(
      @PathVariable UUID eventId,
      @PathVariable UUID itemId,
      @RequestBody(required = false) JsonNode body) {
    return schedule.update(actor(), eventId, itemId, body);
  }

  @DeleteMapping(BASE + "/items/{itemId}")
  ItemDeleted delete(
      @PathVariable UUID eventId,
      @PathVariable UUID itemId,
      @RequestParam(required = false) String expectedVersion,
      @RequestParam(required = false) String publish,
      @RequestParam(required = false) String confirmOtherChanges,
      @RequestParam(required = false) String notify) {
    return schedule.delete(
        actor(), eventId, itemId, expectedVersion, publish, confirmOtherChanges, notify);
  }

  @PostMapping(BASE + "/publish")
  PublishResult publish(@PathVariable UUID eventId, @RequestBody(required = false) JsonNode body) {
    return schedule.publish(actor(), eventId, body);
  }

  @GetMapping(BASE + "/published")
  Published published(@PathVariable UUID eventId) {
    return schedule.published(actor(), eventId);
  }

  private static UUID actor() {
    return OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication())
        .userId();
  }
}
