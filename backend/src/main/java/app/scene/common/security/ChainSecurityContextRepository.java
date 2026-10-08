package app.scene.common.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.function.Supplier;
import org.springframework.security.core.context.DeferredSecurityContext;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.web.context.HttpRequestResponseHolder;
import org.springframework.security.web.context.SecurityContextRepository;

/**
 * Loads only the cookie owned by one in-memory registry. The participant filter chain does not use
 * this repository. Operator sessions stay in Spring Session JDBC.
 */
final class ChainSecurityContextRepository implements SecurityContextRepository {

  private final ChainSessionRegistry sessions;

  ChainSecurityContextRepository(ChainSessionRegistry sessions) {
    this.sessions = sessions;
  }

  @Override
  @SuppressWarnings("deprecation")
  public SecurityContext loadContext(HttpRequestResponseHolder requestResponseHolder) {
    return sessions.load(requestResponseHolder.getRequest());
  }

  @Override
  public DeferredSecurityContext loadDeferredContext(HttpServletRequest request) {
    return new LoadedContext(() -> sessions.load(request));
  }

  @Override
  public void saveContext(
      SecurityContext context, HttpServletRequest request, HttpServletResponse response) {
    // Issuance stays out of this skeleton. A context is stored only through ChainSessionRegistry.
  }

  @Override
  public boolean containsContext(HttpServletRequest request) {
    return sessions.contains(request);
  }

  private static final class LoadedContext implements DeferredSecurityContext {

    private final Supplier<SecurityContext> loader;
    private SecurityContext context;
    private boolean loaded;

    private LoadedContext(Supplier<SecurityContext> loader) {
      this.loader = loader;
    }

    @Override
    public SecurityContext get() {
      if (!loaded) {
        context = loader.get();
        loaded = true;
      }
      return context;
    }

    @Override
    public boolean isGenerated() {
      return get().getAuthentication() == null;
    }
  }
}
