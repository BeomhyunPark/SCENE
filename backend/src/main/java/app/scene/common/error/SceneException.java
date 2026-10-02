package app.scene.common.error;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/** Domain failure that maps to one {@link ErrorCode}. Details are safe to return to the client. */
public final class SceneException extends RuntimeException {

  private final ErrorCode code;
  private final Map<String, Object> details;

  public SceneException(ErrorCode code) {
    this(code, Map.of());
  }

  public SceneException(ErrorCode code, Map<String, Object> details) {
    super(code.name());
    this.code = code;
    this.details = Collections.unmodifiableMap(new LinkedHashMap<>(details));
  }

  public ErrorCode code() {
    return code;
  }

  public Map<String, Object> details() {
    return details;
  }
}
