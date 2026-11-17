package app.scene.event.group;

import app.scene.event.participant.ParticipantSessionCookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Participant's own group (#300). Needs the participant session cookie; no CSRF on GET. */
@RestController
public class ParticipantGroupController {

  private final ParticipantSessionCookie sessions;
  private final ParticipantGroupService groups;

  public ParticipantGroupController(
      ParticipantSessionCookie sessions, ParticipantGroupService groups) {
    this.sessions = sessions;
    this.groups = groups;
  }

  @GetMapping("/api/v1/participant/group")
  ParticipantGroup current(HttpServletRequest request) {
    return groups.current(sessions.require(request));
  }
}
