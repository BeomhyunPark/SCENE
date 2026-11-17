package app.scene.event.participant;

import app.scene.common.security.SecurityProperties;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Participant session. The access key is read from the JSON body only. The operator session cookie
 * is not accepted. Other {@code /api/v1/participant/**} paths stay unauthenticated.
 */
@RestController
public class ParticipantSessionController {

  static final String COOKIE_PATH = "/api/v1/participant";

  private final ParticipantSessionService sessions;
  private final ParticipantSessionCookie cookies;
  private final SecurityProperties security;

  public ParticipantSessionController(
      ParticipantSessionService sessions,
      ParticipantSessionCookie cookies,
      SecurityProperties security) {
    this.sessions = sessions;
    this.cookies = cookies;
    this.security = security;
  }

  @PostMapping("/api/v1/public/events/{eventId}/participant-sessions")
  ResponseEntity<Void> issue(@PathVariable UUID eventId, HttpServletRequest request) {
    String token = sessions.issue(eventId, () -> body(request));
    ResponseCookie cookie =
        ResponseCookie.from(security.session().participantCookieName(), token)
            .httpOnly(true)
            .secure(true)
            .sameSite(security.session().sameSite())
            .path(COOKIE_PATH)
            .build();
    return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, cookie.toString()).build();
  }

  @GetMapping("/api/v1/participant/me")
  ParticipantSelf me(HttpServletRequest request) {
    return cookies.require(request);
  }

  @PostMapping("/api/v1/participant/auth/logout")
  ResponseEntity<Void> logout(HttpServletRequest request) {
    sessions.logout(cookies.token(request));
    return ResponseEntity.noContent().build();
  }

  private static String body(HttpServletRequest request) {
    try {
      return new String(request.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
    } catch (IOException exception) {
      throw new IllegalStateException("request body was not read", exception);
    }
  }
}
