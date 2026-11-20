package app.scene.event.schedule;

import app.scene.event.participant.ParticipantSessionCookie;
import app.scene.event.schedule.ScheduleResponses.ParticipantSchedule;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Participant schedule (DEC-081 §6, api.md "일정표"). Participant session cookie; a temporary-number
 * session is {@code 403 PARTICIPANT_PIN_CHANGE_REQUIRED}. {@code Cache-Control: no-store}, no
 * audit, no address limit.
 */
@RestController
public class ParticipantScheduleController {

  private final ParticipantSessionCookie sessions;
  private final ScheduleService schedule;

  public ParticipantScheduleController(
      ParticipantSessionCookie sessions, ScheduleService schedule) {
    this.sessions = sessions;
    this.schedule = schedule;
  }

  @GetMapping("/api/v1/participant/schedule")
  ResponseEntity<ParticipantSchedule> schedule(HttpServletRequest request) {
    return ResponseEntity.ok()
        .cacheControl(CacheControl.noStore())
        .body(schedule.participant(sessions.require(request)));
  }
}
