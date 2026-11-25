package app.scene.common.invitation;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import java.net.URI;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

/**
 * Sends the invitation link straight to the invited address over SMTP ({@code spring.mail.*}). The
 * link is in the mail body only: it is not logged, stored, or put in the API response. A failure is
 * logged with the invitation kind only, never the address or the link.
 */
@Component
@ConditionalOnProperty(name = "scene.mail.enabled", havingValue = "true")
@EnableConfigurationProperties(InvitationMailProperties.class)
public class SmtpInvitationMailer implements InvitationMailer {

  private static final Logger log = LoggerFactory.getLogger(SmtpInvitationMailer.class);
  private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
  private static final DateTimeFormatter EXPIRES =
      DateTimeFormatter.ofPattern("yyyy년 M월 d일 a h:mm", Locale.KOREAN).withZone(SEOUL);

  private final JavaMailSender sender;
  private final String from;
  private final String baseUrl;

  public SmtpInvitationMailer(JavaMailSender sender, InvitationMailProperties properties) {
    this.sender = sender;
    this.from = required(properties.from(), "scene.mail.from");
    this.baseUrl = origin(required(properties.linkBaseUrl(), "scene.mail.link-base-url"));
  }

  @Override
  public void send(InvitationMail mail) {
    try {
      MimeMessage message = sender.createMimeMessage();
      MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
      helper.setFrom(from);
      helper.setTo(mail.recipient());
      helper.setSubject(InvitationMailText.subject(mail));
      String address = baseUrl + mail.fragmentLink();
      String expires = EXPIRES.format(mail.expiresAt());
      helper.setText(
          InvitationMailText.plain(mail, address, expires),
          InvitationMailText.html(mail, address, expires));
      sender.send(message);
    } catch (MailException | MessagingException ex) {
      log.warn(
          "invitation mail was not sent kind={} error={}", mail.kind(), ex.getClass().getName());
      throw new SceneException(ErrorCode.MAIL_SEND_FAILED);
    }
  }

  @Override
  public boolean deliversMail() {
    return true;
  }

  private static String required(String value, String name) {
    if (value == null || value.isBlank()) {
      throw new IllegalStateException(name + " must be set when scene.mail.enabled is true");
    }
    return value.trim();
  }

  /** {@code https://host[:port]} with no path, so the fragment link lands on the SPA route. */
  static String origin(String raw) {
    URI uri = URI.create(raw);
    String scheme = uri.getScheme();
    if (uri.getHost() == null || !("https".equals(scheme) || "http".equals(scheme))) {
      throw new IllegalStateException("scene.mail.link-base-url must be an http(s) origin");
    }
    return scheme + "://" + uri.getRawAuthority();
  }
}
