package app.scene.event.application;

import app.scene.event.participant.ParticipantSessionCookie;
import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/**
 * Public submit (DEC-078). No operator session. {@code Idempotency-Key} is not read. A first submit
 * is 201 and a resubmit that became an edit is 200; both set the participant session cookie. There
 * is no {@code Location} header.
 */
@RestController
public class PublicApplicationController {

  private final PublicApplicationService applications;
  private final ParticipantSessionCookie sessionCookies;

  public PublicApplicationController(
      PublicApplicationService applications, ParticipantSessionCookie sessionCookies) {
    this.applications = applications;
    this.sessionCookies = sessionCookies;
  }

  @PostMapping("/api/v1/public/events/{eventId}/forms/{formId}/applications")
  ResponseEntity<SubmittedApplication> submit(
      @PathVariable UUID eventId,
      @PathVariable UUID formId,
      @RequestBody(required = false) JsonNode body,
      HttpServletRequest request) {
    PublicApplicationService.Submission submission =
        applications.submit(eventId, formId, body, request.getRemoteAddr());
    return ResponseEntity.status(submission.created() ? HttpStatus.CREATED : HttpStatus.OK)
        .header(HttpHeaders.SET_COOKIE, sessionCookies.setCookie(submission.session()))
        .body(submission.body());
  }
}
