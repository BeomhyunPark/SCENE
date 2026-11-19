package app.scene.event.participant;

import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/**
 * Participant session (DEC-078). Sign-in reads name, phone and the six-digit number from the JSON
 * body. The operator session cookie is not accepted.
 */
@RestController
public class ParticipantSessionController {

  private final ParticipantSessionService sessions;
  private final ParticipantSessionCookie cookies;

  public ParticipantSessionController(
      ParticipantSessionService sessions, ParticipantSessionCookie cookies) {
    this.sessions = sessions;
    this.cookies = cookies;
  }

  @PostMapping("/api/v1/public/events/{eventId}/participant-sessions")
  ResponseEntity<Void> issue(
      @PathVariable UUID eventId,
      @RequestBody(required = false) JsonNode body,
      HttpServletRequest request) {
    ParticipantSessionService.Issued issued =
        sessions.signIn(eventId, body, request.getRemoteAddr());
    return ResponseEntity.noContent()
        .header(HttpHeaders.SET_COOKIE, cookies.setCookie(issued))
        .build();
  }

  @GetMapping("/api/v1/participant/me")
  ParticipantSelf me(HttpServletRequest request) {
    return cookies.requireAny(request);
  }

  @PutMapping("/api/v1/participant/pin")
  ResponseEntity<Void> changePin(
      @RequestBody(required = false) JsonNode body, HttpServletRequest request) {
    ParticipantSelf self = cookies.requireAny(request);
    sessions.changePin(self, cookies.token(request), body, request.getRemoteAddr());
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/api/v1/participant/auth/logout")
  ResponseEntity<Void> logout(HttpServletRequest request) {
    sessions.logout(cookies.token(request));
    return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, cookies.clearCookie()).build();
  }
}
