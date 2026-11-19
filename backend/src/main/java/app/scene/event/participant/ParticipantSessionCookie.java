package app.scene.event.participant;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.security.SecurityProperties;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

/**
 * Reads the participant session cookie. Participant paths that need a session resolve the signed-in
 * participant here. A missing cookie or one with no stored session is {@code
 * AUTHENTICATION_REQUIRED}. The operator session cookie is never read.
 */
@Component
public class ParticipantSessionCookie {

  private final ParticipantSessionService sessions;
  private final SecurityProperties security;

  public ParticipantSessionCookie(ParticipantSessionService sessions, SecurityProperties security) {
    this.sessions = sessions;
    this.security = security;
  }

  static final String COOKIE_PATH = "/api/v1/participant";

  /** The {@code Set-Cookie} value for a raw session token (DEC-067). */
  public String setCookie(String token) {
    return ResponseCookie.from(security.session().participantCookieName(), token)
        .httpOnly(true)
        .secure(true)
        .sameSite(security.session().sameSite())
        .path(COOKIE_PATH)
        .build()
        .toString();
  }

  /**
   * The signed-in participant, or 401. A session opened with a temporary number is {@code
   * PARTICIPANT_PIN_CHANGE_REQUIRED} until a new number is set (DEC-078 §2).
   */
  public ParticipantSelf require(HttpServletRequest request) {
    ParticipantSelf self = requireAny(request);
    if (self.pinChangeRequired()) {
      throw new SceneException(ErrorCode.PARTICIPANT_PIN_CHANGE_REQUIRED);
    }
    return self;
  }

  /** The signed-in participant, also a temporary-number session, or 401. */
  public ParticipantSelf requireAny(HttpServletRequest request) {
    return sessions
        .current(token(request))
        .orElseThrow(() -> new SceneException(ErrorCode.AUTHENTICATION_REQUIRED));
  }

  /** The raw cookie value, or null. */
  public String token(HttpServletRequest request) {
    Cookie[] cookies = request.getCookies();
    if (cookies == null) {
      return null;
    }
    String name = security.session().participantCookieName();
    for (Cookie cookie : cookies) {
      if (name.equals(cookie.getName())) {
        return cookie.getValue();
      }
    }
    return null;
  }
}
