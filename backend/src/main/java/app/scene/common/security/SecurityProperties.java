package app.scene.common.security;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Placeholder security settings. Cookie names are not the conceptual names in security-privacy §2.
 * SameSite's token and the frontend origin are not decided.
 */
@ConfigurationProperties(prefix = "scene.security")
public record SecurityProperties(Cors cors, Session session) {

  /** Conceptual names from security-privacy §2. They are not cookie names. */
  public static final Set<String> CONCEPTUAL_COOKIE_NAMES =
      Set.of("scene_operator_session", "scene_participant_session");

  private static final Set<String> SAME_SITE_TOKENS = Set.of("Lax", "Strict", "None");

  public SecurityProperties {
    if (cors == null || session == null) {
      throw new IllegalArgumentException(
          "scene.security.cors and scene.security.session are required");
    }
  }

  /** Comma-separated origin allowlist. Blank means no browser origin is allowed. */
  public record Cors(String allowedOrigins) {

    public List<String> origins() {
      if (allowedOrigins == null || allowedOrigins.isBlank()) {
        return List.of();
      }
      List<String> origins = new ArrayList<>();
      for (String part : allowedOrigins.split(",")) {
        String origin = part.trim();
        if (origin.isEmpty()) {
          continue;
        }
        if ("*".equals(origin) || origin.indexOf(' ') >= 0 || !origin.contains("://")) {
          throw new IllegalArgumentException("CORS allowed origin is not an allowlist entry");
        }
        origins.add(origin);
      }
      return List.copyOf(origins);
    }
  }

  /**
   * {@code sameSite} is a placeholder token so the attribute exists. It is not a product choice.
   * HttpOnly and Secure are fixed by security-privacy §2 and are not properties.
   */
  public record Session(String operatorCookieName, String participantCookieName, String sameSite) {

    public Session {
      operatorCookieName = requireCookieName(operatorCookieName);
      participantCookieName = requireCookieName(participantCookieName);
      if (operatorCookieName.equals(participantCookieName)) {
        throw new IllegalArgumentException(
            "operator and participant session cookie names must differ");
      }
      if (!SAME_SITE_TOKENS.contains(sameSite)) {
        throw new IllegalArgumentException("SameSite placeholder must be Lax, Strict, or None");
      }
    }
  }

  private static String requireCookieName(String name) {
    if (name != null && CONCEPTUAL_COOKIE_NAMES.contains(name)) {
      throw new IllegalArgumentException(
          "cookie name is a conceptual name from security-privacy §2 and is not approved");
    }
    if (name == null || !name.matches("[A-Za-z0-9-]{1,64}")) {
      throw new IllegalArgumentException("session cookie name must be a placeholder token");
    }
    return name;
  }
}
