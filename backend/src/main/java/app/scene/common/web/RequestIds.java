package app.scene.common.web;

import java.util.UUID;
import java.util.regex.Pattern;

/** The request id is {@code X-Request-Id}. It is not a distributed trace id. */
public final class RequestIds {

  public static final String HEADER = "X-Request-Id";
  public static final String ATTRIBUTE = "app.scene.requestId";
  public static final String MDC_KEY = "requestId";

  private static final Pattern VALID = Pattern.compile("[A-Za-z0-9._\\-]{1,128}");

  private RequestIds() {}

  public static String resolve(String supplied) {
    if (supplied != null && VALID.matcher(supplied).matches()) {
      return supplied;
    }
    return UUID.randomUUID().toString();
  }
}
