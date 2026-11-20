package app.scene.event.notification;

import app.scene.identity.OperatorPrincipal;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/**
 * The operator's own notification list in one event (DEC-080 §7.5, I3 #436). Same query, body and
 * response as the participant list. Only rows whose recipient is the session's operator are read or
 * marked; another operator's notification id changes nothing and gives the same answer. Operator
 * session; POST needs CSRF. Responses are {@code Cache-Control: no-store}. No audit.
 */
@RestController
public class OperatorNotificationController {

  private final OperatorNotificationAccess access;
  private final Notifications notifications;

  public OperatorNotificationController(
      OperatorNotificationAccess access, Notifications notifications) {
    this.access = access;
    this.notifications = notifications;
  }

  @GetMapping("/api/v1/operator/events/{eventId}/notifications")
  ResponseEntity<NotificationPage> list(
      @PathVariable UUID eventId,
      @RequestParam(required = false) String before,
      @RequestParam(required = false) String limit) {
    NotificationRecipient recipient = access.open(actor(), eventId);
    NotificationPage page =
        notifications.page(recipient, NotificationListQuery.parse(before, limit));
    return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(page);
  }

  @PostMapping("/api/v1/operator/events/{eventId}/notifications/read")
  ResponseEntity<UnreadCount> read(
      @PathVariable UUID eventId, @RequestBody(required = false) JsonNode body) {
    NotificationRecipient recipient = access.open(actor(), eventId);
    UnreadCount count = notifications.markRead(recipient, NotificationReadRequest.parse(body));
    return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(count);
  }

  private static UUID actor() {
    return OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication())
        .userId();
  }
}
