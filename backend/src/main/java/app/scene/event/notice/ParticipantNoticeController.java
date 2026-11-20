package app.scene.event.notice;

import app.scene.event.participant.ParticipantSessionCookie;
import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Participant notice list and detail (DEC-082, api.md "공지"). Participant session cookie; a
 * temporary-number session is {@code 403 PARTICIPANT_PIN_CHANGE_REQUIRED}. {@code Cache-Control:
 * no-store}, no audit.
 */
@RestController
public class ParticipantNoticeController {

  private final ParticipantSessionCookie sessions;
  private final ParticipantNoticeService notices;

  public ParticipantNoticeController(
      ParticipantSessionCookie sessions, ParticipantNoticeService notices) {
    this.sessions = sessions;
    this.notices = notices;
  }

  @GetMapping("/api/v1/participant/notices")
  ResponseEntity<ParticipantNoticePage> list(
      HttpServletRequest request,
      @RequestParam(required = false) String before,
      @RequestParam(required = false) String limit) {
    return noStore(notices.list(sessions.require(request), before, limit));
  }

  @GetMapping("/api/v1/participant/notices/{noticeId}")
  ResponseEntity<ParticipantNoticeDetail> detail(
      HttpServletRequest request, @PathVariable UUID noticeId) {
    return noStore(notices.detail(sessions.require(request), noticeId));
  }

  private static <T> ResponseEntity<T> noStore(T body) {
    return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
  }
}
