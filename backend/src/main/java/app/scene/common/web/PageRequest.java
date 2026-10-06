package app.scene.common.web;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import java.util.Map;

/**
 * Offset page from the shared list contract. {@code page} starts at 0. A missing size is 50. A size
 * above 100 is rejected and is not clamped.
 */
public record PageRequest(int number, int size) {

  public static final int DEFAULT_SIZE = 50;
  public static final int MAX_SIZE = 100;

  public PageRequest {
    if (number < 0 || size < 1 || size > MAX_SIZE) {
      throw new IllegalArgumentException("page coordinates are out of range");
    }
  }

  /** {@code number} and {@code size} are omitted query values when null. */
  public static PageRequest of(Integer number, Integer size) {
    int resolvedNumber = number == null ? 0 : number;
    int resolvedSize = size == null ? DEFAULT_SIZE : size;
    if (resolvedNumber < 0) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "page"));
    }
    if (resolvedSize < 1) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "size"));
    }
    if (resolvedSize > MAX_SIZE) {
      throw new SceneException(ErrorCode.PAGE_SIZE_EXCEEDED);
    }
    return new PageRequest(resolvedNumber, resolvedSize);
  }

  public long offset() {
    return (long) number * size;
  }
}
