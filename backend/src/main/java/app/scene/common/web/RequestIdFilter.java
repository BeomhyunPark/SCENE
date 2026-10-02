package app.scene.common.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Assigns one request id, returns it on the response, and writes one access line. The query string
 * stays out of that line.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter extends OncePerRequestFilter {

  private static final Logger access = LoggerFactory.getLogger("app.scene.access");

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    String requestId = RequestIds.resolve(request.getHeader(RequestIds.HEADER));
    request.setAttribute(RequestIds.ATTRIBUTE, requestId);
    response.setHeader(RequestIds.HEADER, requestId);
    MDC.put(RequestIds.MDC_KEY, requestId);
    long started = System.nanoTime();
    try {
      filterChain.doFilter(request, response);
    } finally {
      long durationMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
      try {
        // requestId is already in MDC. Adding it again makes the JSON formatter drop the line.
        access
            .atInfo()
            .addKeyValue("method", request.getMethod())
            .addKeyValue("path", request.getRequestURI())
            .addKeyValue("status", response.getStatus())
            .addKeyValue("durationMs", durationMs)
            .log("request");
      } finally {
        MDC.remove(RequestIds.MDC_KEY);
      }
    }
  }
}
