package app.scene.common.invitation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSenderImpl;

/** The mail carries the absolute link; the port reports EMAIL delivery and hides the link. */
class SmtpInvitationMailerTest {

  private static final String LINK = "/operator/invitations#tok_abcdefghijklmnopqrstuvwxyz";

  private static final class RecordingSender extends JavaMailSenderImpl {
    final List<MimeMessage> sent = new ArrayList<>();
    boolean fail;

    @Override
    public void send(MimeMessage message) {
      if (fail) {
        throw new MailSendException("refused");
      }
      sent.add(message);
    }
  }

  private static InvitationMail mail(InvitationMail.Kind kind, String target, String role) {
    return new InvitationMail(
        kind,
        "ada@example.com",
        role,
        target,
        "Grace <Hopper>",
        LINK,
        Instant.parse("2026-12-02T06:00:00Z"));
  }

  private static SmtpInvitationMailer mailer(RecordingSender sender) {
    return new SmtpInvitationMailer(
        sender,
        new InvitationMailProperties(
            true, "SCENE <no-reply@example.org>", "https://scene.example.org/ignored/path"));
  }

  @Test
  void sendsTheAbsoluteLinkToTheInvitedAddress() throws Exception {
    RecordingSender sender = new RecordingSender();
    SmtpInvitationMailer mailer = mailer(sender);

    mailer.send(mail(InvitationMail.Kind.EVENT, "겨울 수련회", "STAFF"));

    assertThat(sender.sent).hasSize(1);
    MimeMessage message = sender.sent.get(0);
    message.saveChanges();
    assertThat(((InternetAddress) message.getAllRecipients()[0]).getAddress())
        .isEqualTo("ada@example.com");
    assertThat(((InternetAddress) message.getFrom()[0]).getAddress())
        .isEqualTo("no-reply@example.org");
    assertThat(message.getSubject()).isEqualTo("[SCENE] 겨울 수련회 운영 멤버에 초대받았어요");
    String plain = part(message, "text/plain");
    String html = part(message, "text/html");
    String address = "https://scene.example.org" + LINK;
    assertThat(plain)
        .contains(address)
        .contains("Grace <Hopper>님이 겨울 수련회 운영 멤버로 초대했어요. 역할: Staff")
        .contains("ada@example.com 계정으로 로그인해야")
        .contains("2026년 12월 2일 오후 3:00까지");
    assertThat(html).contains("href=\"" + address + "\"").contains("Grace &lt;Hopper&gt;");
    assertThat(html).doesNotContain("Grace <Hopper>");
  }

  @Test
  void spaceInvitationsNameTheSpace() throws Exception {
    RecordingSender sender = new RecordingSender();

    mailer(sender).send(mail(InvitationMail.Kind.SPACE, "청년2부", "MEMBER"));

    MimeMessage message = sender.sent.get(0);
    assertThat(message.getSubject()).isEqualTo("[SCENE] 청년2부 조직 멤버에 초대받았어요");
    assertThat(part(message, "text/plain")).contains("역할: Member");
  }

  @Test
  void reportsMailDeliveryAndKeepsTheLinkOffTheResponse() {
    SmtpInvitationMailer mailer = mailer(new RecordingSender());

    assertThat(mailer.delivery()).isEqualTo(InvitationMailer.Delivery.EMAIL);
    assertThat(mailer.linkForResponse(LINK)).isNull();
    CapturingInvitationMailer capturing = new CapturingInvitationMailer();
    assertThat(capturing.delivery()).isEqualTo(InvitationMailer.Delivery.LINK);
    assertThat(capturing.linkForResponse(LINK)).isEqualTo(LINK);
  }

  @Test
  void aRefusedSendIsMailSendFailed() {
    RecordingSender sender = new RecordingSender();
    sender.fail = true;

    assertThatThrownBy(() -> mailer(sender).send(mail(InvitationMail.Kind.EVENT, "e", "STAFF")))
        .isInstanceOfSatisfying(
            SceneException.class,
            ex -> assertThat(ex.code()).isEqualTo(ErrorCode.MAIL_SEND_FAILED));
  }

  @Test
  void needsASenderAndAnHttpOrigin() {
    RecordingSender sender = new RecordingSender();

    assertThatThrownBy(
            () ->
                new SmtpInvitationMailer(
                    sender, new InvitationMailProperties(true, "", "https://scene.example.org")))
        .isInstanceOf(IllegalStateException.class);
    assertThatThrownBy(
            () ->
                new SmtpInvitationMailer(
                    sender,
                    new InvitationMailProperties(true, "a@example.org", "scene.example.org")))
        .isInstanceOf(IllegalStateException.class);
    assertThat(SmtpInvitationMailer.origin("http://localhost:5173/"))
        .isEqualTo("http://localhost:5173");
  }

  private static String part(Part part, String type) throws Exception {
    if (part.isMimeType(type)) {
      return (String) part.getContent();
    }
    if (part.getContent() instanceof Multipart multipart) {
      for (int i = 0; i < multipart.getCount(); i++) {
        String found = part(multipart.getBodyPart(i), type);
        if (found != null) {
          return found;
        }
      }
    }
    return null;
  }
}
