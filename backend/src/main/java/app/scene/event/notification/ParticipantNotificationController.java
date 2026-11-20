package app.scene.event.notification;

import app.scene.event.participant.ParticipantSessionCookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/**
 * The participant's own notification list (DEC-080 §7.4). Participant session cookie; POST needs
 * CSRF. Responses are {@code Cache-Control: no-store}. No audit.
 */
@RestController
public class ParticipantNotificationController {

  private final ParticipantSessionCookie sessions;
  private final Notifications notifications;

  public ParticipantNotificationController(
      ParticipantSessionCookie sessions, Notifications notifications) {
    this.sessions = sessions;
    this.notifications = notifications;
  }

  @GetMapping("/api/v1/participant/notifications")
  ResponseEntity<NotificationPage> list(
      @RequestParam(required = false) String before,
      @RequestParam(required = false) String limit,
      HttpServletRequest request) {
    NotificationRecipient recipient = NotificationRecipient.participant(sessions.require(request));
    NotificationPage page =
        notifications.page(recipient, NotificationListQuery.parse(before, limit));
    return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(page);
  }

  @PostMapping("/api/v1/participant/notifications/read")
  ResponseEntity<UnreadCount> read(
      @RequestBody(required = false) JsonNode body, HttpServletRequest request) {
    NotificationRecipient recipient = NotificationRecipient.participant(sessions.require(request));
    UnreadCount count = notifications.markRead(recipient, NotificationReadRequest.parse(body));
    return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(count);
  }
}
