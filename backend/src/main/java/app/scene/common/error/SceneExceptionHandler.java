package app.scene.common.error;

import app.scene.common.web.RequestIds;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/**
 * RFC 9457 body for {@link SceneException} and request-shape failures. Ordered ahead of Boot's
 * problem-details advice so the stable {@code code} is present.
 */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
public class SceneExceptionHandler {

  private static final Logger log = LoggerFactory.getLogger(SceneExceptionHandler.class);

  @ExceptionHandler(SceneException.class)
  ResponseEntity<ProblemDetail> scene(SceneException exception, HttpServletRequest request) {
    ProblemDetail problem = problem(exception.code(), request);
    List<Map<String, String>> errors = new ArrayList<>();
    for (Map.Entry<String, Object> entry : exception.details().entrySet()) {
      if ("field".equals(entry.getKey()) && entry.getValue() instanceof String field) {
        errors.add(Map.of("field", field));
        continue;
      }
      if (isSafeExtension(entry.getValue())) {
        problem.setProperty(entry.getKey(), entry.getValue());
      }
    }
    if (!errors.isEmpty()) {
      problem.setProperty("errors", errors);
    }
    return response(problem);
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  ResponseEntity<ProblemDetail> invalidBody(
      MethodArgumentNotValidException exception, HttpServletRequest request) {
    ProblemDetail problem = problem(ErrorCode.VALIDATION_FAILED, request);
    List<Map<String, String>> errors = new ArrayList<>();
    exception
        .getBindingResult()
        .getFieldErrors()
        .forEach(
            fieldError -> {
              Map<String, String> error = new LinkedHashMap<>();
              error.put("field", fieldError.getField());
              error.put("code", fieldCode(fieldError.getCode()));
              if (fieldError.getDefaultMessage() != null) {
                error.put("message", fieldError.getDefaultMessage());
              }
              errors.add(error);
            });
    problem.setProperty("errors", errors);
    return response(problem);
  }

  @ExceptionHandler({
    HttpMessageNotReadableException.class,
    MissingServletRequestParameterException.class,
    MethodArgumentTypeMismatchException.class,
    HandlerMethodValidationException.class
  })
  ResponseEntity<ProblemDetail> malformed(HttpServletRequest request) {
    return response(problem(ErrorCode.VALIDATION_FAILED, request));
  }

  @ExceptionHandler(Exception.class)
  ResponseEntity<ProblemDetail> unexpected(Exception exception, HttpServletRequest request) {
    log.error("Unhandled request failure", exception);
    ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.INTERNAL_SERVER_ERROR);
    problem.setType(URI.create("urn:scene:problem:unexpected"));
    problem.setTitle("Unexpected error");
    problem.setDetail("요청을 처리하지 못했습니다.");
    problem.setProperty("traceId", traceId(request));
    return response(problem);
  }

  private static ProblemDetail problem(ErrorCode code, HttpServletRequest request) {
    ProblemDetail problem = ProblemDetail.forStatus(code.httpStatus());
    problem.setType(code.type());
    problem.setTitle(code.title());
    problem.setDetail(code.detail());
    problem.setProperty("code", code.name());
    problem.setProperty("traceId", traceId(request));
    return problem;
  }

  private static ResponseEntity<ProblemDetail> response(ProblemDetail problem) {
    return ResponseEntity.status(problem.getStatus())
        .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_PROBLEM_JSON_VALUE)
        .body(problem);
  }

  private static String traceId(HttpServletRequest request) {
    Object assigned = request.getAttribute(RequestIds.ATTRIBUTE);
    if (assigned instanceof String requestId) {
      return requestId;
    }
    return RequestIds.resolve(request.getHeader(RequestIds.HEADER));
  }

  /** Field-level code. Blank and null constraints share the contract example's REQUIRED. */
  private static String fieldCode(String springCode) {
    if (springCode == null) {
      return "INVALID";
    }
    if ("NotNull".equals(springCode)
        || "NotBlank".equals(springCode)
        || "NotEmpty".equals(springCode)) {
      return "REQUIRED";
    }
    return springCode;
  }

  private static boolean isSafeExtension(Object value) {
    return value instanceof String
        || value instanceof Number
        || value instanceof Boolean
        || value instanceof Map<?, ?>
        || value instanceof List<?>;
  }
}
