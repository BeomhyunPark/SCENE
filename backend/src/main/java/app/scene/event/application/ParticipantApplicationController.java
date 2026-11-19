package app.scene.event.application;

import app.scene.event.participant.ParticipantSessionCookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/** The participant's own application (DEC-078 §4). Participant session cookie only. */
@RestController
public class ParticipantApplicationController {

  private final ParticipantApplicationService applications;
  private final ParticipantSessionCookie cookies;

  public ParticipantApplicationController(
      ParticipantApplicationService applications, ParticipantSessionCookie cookies) {
    this.applications = applications;
    this.cookies = cookies;
  }

  @GetMapping("/api/v1/participant/application")
  ParticipantApplication read(HttpServletRequest request) {
    return applications.read(cookies.require(request));
  }

  @PutMapping("/api/v1/participant/application")
  ParticipantApplication edit(
      @RequestBody(required = false) JsonNode body, HttpServletRequest request) {
    return applications.edit(cookies.require(request), body);
  }
}
