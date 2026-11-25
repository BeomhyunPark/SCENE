package app.scene.common.invitation;

import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Stand-in for the mailer port while {@code scene.mail.enabled} is off (local, tests, or a server
 * with no mail account yet). Nothing leaves the process; create and resend return the link once
 * instead. Tests read what was "sent". The raw token is not logged and is not written anywhere
 * except the fragment link held here for that port call.
 */
@Component
@ConditionalOnProperty(name = "scene.mail.enabled", havingValue = "false", matchIfMissing = true)
public class CapturingInvitationMailer implements InvitationMailer {

  private final List<InvitationMail> sent = new ArrayList<>();

  @Override
  public synchronized void send(InvitationMail mail) {
    sent.add(mail);
  }

  @Override
  public boolean deliversMail() {
    return false;
  }

  public synchronized List<InvitationMail> sent() {
    return List.copyOf(sent);
  }

  public synchronized void clear() {
    sent.clear();
  }
}
