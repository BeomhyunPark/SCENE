package app.scene.identity;

import app.scene.identity.mapper.GoogleIdentityMapper;
import java.time.Clock;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Turns a verified Google account into a SCENE operator (DEC-069). Anyone with a verified Google
 * email may sign in; the first sign-in creates the user. Access still comes only from memberships
 * and invitations. The configured bootstrap owner gets the first space.
 */
@Service
public class GoogleAccountService {

  static final int NAME_MAX = 200;

  private final GoogleIdentityMapper identities;
  private final GoogleSignInProperties properties;
  private final Clock clock;

  public GoogleAccountService(
      GoogleIdentityMapper identities, GoogleSignInProperties properties, Clock clock) {
    this.identities = identities;
    this.properties = properties;
    this.clock = clock;
  }

  /** Thrown when Google did not verify the email. The caller sends the browser back to login. */
  public static final class UnverifiedEmail extends RuntimeException {
    @java.io.Serial private static final long serialVersionUID = 1L;

    UnverifiedEmail() {
      super("Google email is not verified");
    }
  }

  @Transactional
  public OperatorPrincipal signIn(
      String subject, String rawEmail, boolean emailVerified, String rawName) {
    if (subject == null || subject.isBlank() || rawEmail == null || !emailVerified) {
      throw new UnverifiedEmail();
    }
    String email = rawEmail.strip().toLowerCase(Locale.ROOT);
    Instant now = clock.instant();
    GoogleIdentityRow existing = identities.findBySubject(subject);
    UUID userId;
    String displayName;
    if (existing != null) {
      identities.touchIdentity(subject, email, now);
      userId = existing.userId();
      displayName = existing.displayName();
    } else {
      userId = UUID.randomUUID();
      displayName = displayName(rawName, email);
      identities.insertUser(userId, displayName);
      identities.insertIdentity(subject, userId, email, now);
    }
    bootstrap(userId, email);
    return new OperatorPrincipal(userId, displayName, email);
  }

  private void bootstrap(UUID userId, String email) {
    String owner = properties.ownerEmail();
    String spaceName = properties.spaceName();
    if (owner == null
        || owner.isBlank()
        || spaceName == null
        || spaceName.isBlank()
        || !owner.strip().toLowerCase(Locale.ROOT).equals(email)) {
      return;
    }
    identities.lockBootstrap();
    if (identities.countSpaces() > 0) {
      return;
    }
    UUID spaceId = UUID.randomUUID();
    identities.insertSpace(spaceId, truncate(spaceName.strip()));
    identities.insertOwner(spaceId, userId);
  }

  /** Google's name, or the part of the email before {@code @}. */
  static String displayName(String rawName, String email) {
    String name = rawName == null ? "" : rawName.strip();
    if (name.isEmpty()) {
      int at = email.indexOf('@');
      name = at > 0 ? email.substring(0, at) : email;
    }
    return truncate(name);
  }

  private static String truncate(String value) {
    return value.length() > NAME_MAX ? value.substring(0, NAME_MAX) : value;
  }
}
