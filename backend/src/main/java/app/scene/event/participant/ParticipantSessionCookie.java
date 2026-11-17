package app.scene.event.participant;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.security.SecurityProperties;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
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

  /** The signed-in participant, or 401. */
  public ParticipantSelf require(HttpServletRequest request) {
    return sessions
        .current(token(request))
        .orElseThrow(() -> new SceneException(ErrorCode.AUTHENTICATION_REQUIRED));
  }

  /** The raw cookie value, or null. */
  String token(HttpServletRequest request) {
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
