package app.scene.event.checkin;

import app.scene.event.participant.ParticipantSessionCookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Participant check-in QR (#283). Needs the participant session cookie; no CSRF on GET. */
@RestController
public class ParticipantCheckInController {

  private final ParticipantSessionCookie sessions;
  private final ParticipantCheckInService checkIns;

  public ParticipantCheckInController(
      ParticipantSessionCookie sessions, ParticipantCheckInService checkIns) {
    this.sessions = sessions;
    this.checkIns = checkIns;
  }

  @GetMapping("/api/v1/participant/check-in")
  ParticipantCheckIn current(HttpServletRequest request) {
    return checkIns.current(sessions.require(request));
  }
}
