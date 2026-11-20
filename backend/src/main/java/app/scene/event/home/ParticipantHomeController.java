package app.scene.event.home;

import app.scene.event.participant.ParticipantSessionCookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Participant home and refresh check (DEC-080 §3–4). Participant session cookie; a temporary-number
 * session is {@code 403 PARTICIPANT_PIN_CHANGE_REQUIRED}. No CSRF on GET, {@code Cache-Control:
 * no-store}, no audit.
 */
@RestController
public class ParticipantHomeController {

  private final ParticipantSessionCookie sessions;
  private final ParticipantHomeService home;

  public ParticipantHomeController(ParticipantSessionCookie sessions, ParticipantHomeService home) {
    this.sessions = sessions;
    this.home = home;
  }

  @GetMapping("/api/v1/participant/home")
  ResponseEntity<ParticipantHome> home(HttpServletRequest request) {
    return noStore(home.home(sessions.require(request)));
  }

  @GetMapping("/api/v1/participant/updates")
  ResponseEntity<ParticipantUpdates> updates(HttpServletRequest request) {
    return noStore(home.updates(sessions.require(request)));
  }

  private static <T> ResponseEntity<T> noStore(T body) {
    return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
  }
}
