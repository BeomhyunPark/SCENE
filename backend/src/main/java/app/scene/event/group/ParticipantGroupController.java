package app.scene.event.group;

import app.scene.event.participant.ParticipantSessionCookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * Participant's own group (#300) and a leader's member detail (#452, DEC-083). Needs the
 * participant session cookie; no CSRF on GET. The member detail carries a phone, so it is {@code
 * Cache-Control: no-store}.
 */
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

  @GetMapping("/api/v1/participant/group/members/{participantId}")
  ResponseEntity<ParticipantGroupMember> member(
      HttpServletRequest request, @PathVariable String participantId) {
    ParticipantGroupMember member = groups.member(sessions.require(request), participantId);
    return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(member);
  }
}
