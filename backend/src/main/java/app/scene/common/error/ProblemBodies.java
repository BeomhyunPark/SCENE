package app.scene.common.error;

import app.scene.common.web.RequestIds;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;

/** RFC 9457 body for one {@link ErrorCode}. Security filters and MVC share this shape. */
public final class ProblemBodies {

  private ProblemBodies() {}

  public static ProblemDetail of(ErrorCode code, HttpServletRequest request) {
    ProblemDetail problem = ProblemDetail.forStatus(code.httpStatus());
    problem.setType(code.type());
    problem.setTitle(code.title());
    problem.setDetail(code.detail());
    problem.setProperty("code", code.name());
    problem.setProperty("traceId", traceId(request));
    return problem;
  }

  public static void write(HttpServletResponse response, ProblemDetail problem) throws IOException {
    response.setStatus(problem.getStatus());
    response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
    response.getOutputStream().write(json(problem).getBytes(StandardCharsets.UTF_8));
  }

  static String traceId(HttpServletRequest request) {
    Object assigned = request.getAttribute(RequestIds.ATTRIBUTE);
    if (assigned instanceof String requestId) {
      return requestId;
    }
    return RequestIds.resolve(request.getHeader(RequestIds.HEADER));
  }

  private static String json(ProblemDetail problem) {
    String code = String.valueOf(problem.getProperties().get("code"));
    String traceId = String.valueOf(problem.getProperties().get("traceId"));
    return "{"
        + field("type", problem.getType().toString())
        + ","
        + field("title", problem.getTitle())
        + ",\"status\":"
        + problem.getStatus()
        + ","
        + field("detail", problem.getDetail())
        + ","
        + field("code", code)
        + ","
        + field("traceId", traceId)
        + "}";
  }

  private static String field(String name, String value) {
    return "\"" + name + "\":" + quote(value);
  }

  private static String quote(String value) {
    StringBuilder quoted = new StringBuilder(value.length() + 2);
    quoted.append('"');
    for (int i = 0; i < value.length(); i++) {
      char current = value.charAt(i);
      switch (current) {
        case '\\', '"' -> quoted.append('\\').append(current);
        case '\n' -> quoted.append("\\n");
        case '\r' -> quoted.append("\\r");
        case '\t' -> quoted.append("\\t");
        default -> quoted.append(current);
      }
    }
    quoted.append('"');
    return quoted.toString();
  }
}
