package app.scene.event.room;

import app.scene.event.participant.ParticipantSessionCookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Participant's own room and the room list (#457, api.md "숙소"). Needs the participant session
 * cookie; no CSRF on GET. {@code Cache-Control: no-store}.
 */
@RestController
public class ParticipantRoomController {

  private final ParticipantSessionCookie sessions;
  private final ParticipantRoomService rooms;

  public ParticipantRoomController(
      ParticipantSessionCookie sessions, ParticipantRoomService rooms) {
    this.sessions = sessions;
    this.rooms = rooms;
  }

  @GetMapping("/api/v1/participant/rooms")
  ResponseEntity<ParticipantRooms> current(HttpServletRequest request) {
    ParticipantRooms body = rooms.current(sessions.require(request));
    return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
  }
}
