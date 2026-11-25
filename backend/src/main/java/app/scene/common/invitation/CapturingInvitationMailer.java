package app.scene.event.invitation;

import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * In-memory stand-in for the mailer port. Tests read what was sent. The raw token is not logged and
 * is not written anywhere except the fragment link held here for that port call.
 */
@Component
public class CapturingInvitationMailer implements InvitationMailer {

  private final List<InvitationMail> sent = new ArrayList<>();

  @Override
  public void send(InvitationMail mail) {
    sent.add(mail);
  }

  public List<InvitationMail> sent() {
    return List.copyOf(sent);
  }

  public void clear() {
    sent.clear();
  }
}
