package app.scene.common.security;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * In-memory stand-in so the two chains can keep separate cookies. This is not the session store.
 * TTL, recovery, and Spring Session JDBC are P0-09 and are intentionally absent.
 */
final class ChainSessionRegistry {

  private final ConcurrentHashMap<String, Authentication> sessions = new ConcurrentHashMap<>();
  private final String cookieName;
  private final String sameSite;

  ChainSessionRegistry(String cookieName, String sameSite) {
    this.cookieName = cookieName;
    this.sameSite = sameSite;
  }

  String cookieName() {
    return cookieName;
  }

  /**
   * Saves an already authenticated context and writes this chain's cookie. There is no login HTTP
   * route; tests and a later authentication filter are the only callers.
   */
  Cookie establish(Authentication authentication, HttpServletResponse response) {
    if (authentication == null || !authentication.isAuthenticated()) {
      throw new IllegalArgumentException("only an authenticated context can be stored");
    }
    String id = UUID.randomUUID().toString();
    sessions.put(id, authentication);
    response.addHeader(HttpHeaders.SET_COOKIE, sessionCookie(id).toString());
    return new Cookie(cookieName, id);
  }

  SecurityContext load(HttpServletRequest request) {
    String id = cookieValue(request);
    Authentication authentication = id == null ? null : sessions.get(id);
    SecurityContext context = SecurityContextHolder.createEmptyContext();
    if (authentication != null) {
      context.setAuthentication(authentication);
    }
    return context;
  }

  boolean contains(HttpServletRequest request) {
    String id = cookieValue(request);
    return id != null && sessions.containsKey(id);
  }

  private ResponseCookie sessionCookie(String id) {
    return ResponseCookie.from(cookieName, id)
        .httpOnly(true)
        .secure(true)
        .sameSite(sameSite)
        .path("/")
        .build();
  }

  private String cookieValue(HttpServletRequest request) {
    Cookie[] cookies = request.getCookies();
    if (cookies == null) {
      return null;
    }
    for (Cookie cookie : cookies) {
      if (cookieName.equals(cookie.getName())) {
        return cookie.getValue();
      }
    }
    return null;
  }
}
