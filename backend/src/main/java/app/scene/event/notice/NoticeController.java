package app.scene.event.notice;

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

/** Operator notices (DEC-082, api.md "공지"). Create is 201, draft delete is 204. */
@RestController
public class NoticeController {

  private static final String BASE = "/api/v1/operator/events/{eventId}/notices";

  private final NoticeService notices;

  public NoticeController(NoticeService notices) {
    this.notices = notices;
  }

  @GetMapping(BASE)
  NoticeList list(
      @PathVariable UUID eventId,
      @RequestParam(required = false) String status,
      @RequestParam(required = false) String audience,
      @RequestParam(required = false) String before,
      @RequestParam(required = false) String limit) {
    return notices.list(actor(), eventId, status, audience, before, limit);
  }

  @PostMapping(BASE)
  ResponseEntity<NoticeWritten> create(
      @PathVariable UUID eventId, @RequestBody(required = false) JsonNode body) {
    return ResponseEntity.status(HttpStatus.CREATED).body(notices.create(actor(), eventId, body));
  }

  @GetMapping(BASE + "/{noticeId}")
  Notice detail(@PathVariable UUID eventId, @PathVariable UUID noticeId) {
    return notices.detail(actor(), eventId, noticeId);
  }

  @PatchMapping(BASE + "/{noticeId}")
  NoticeWritten patch(
      @PathVariable UUID eventId,
      @PathVariable UUID noticeId,
      @RequestBody(required = false) JsonNode body) {
    return notices.patch(actor(), eventId, noticeId, body);
  }

  @DeleteMapping(BASE + "/{noticeId}")
  ResponseEntity<Void> delete(
      @PathVariable UUID eventId,
      @PathVariable UUID noticeId,
      @RequestParam(required = false) String expectedVersion) {
    notices.delete(actor(), eventId, noticeId, expectedVersion);
    return ResponseEntity.noContent().build();
  }

  @PostMapping(BASE + "/{noticeId}/publish")
  NoticeCommandResult publish(
      @PathVariable UUID eventId,
      @PathVariable UUID noticeId,
      @RequestBody(required = false) JsonNode body) {
    return notices.publish(actor(), eventId, noticeId, body);
  }

  @PostMapping(BASE + "/{noticeId}/archive")
  NoticeCommandResult archive(
      @PathVariable UUID eventId,
      @PathVariable UUID noticeId,
      @RequestBody(required = false) JsonNode body) {
    return notices.archive(actor(), eventId, noticeId, body);
  }

  @PostMapping(BASE + "/{noticeId}/unarchive")
  NoticeCommandResult unarchive(
      @PathVariable UUID eventId,
      @PathVariable UUID noticeId,
      @RequestBody(required = false) JsonNode body) {
    return notices.unarchive(actor(), eventId, noticeId, body);
  }

  private static UUID actor() {
    return OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication())
        .userId();
  }
}
