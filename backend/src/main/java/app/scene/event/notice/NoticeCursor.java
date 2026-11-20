package app.scene.event.notice;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.Comparator;
import java.util.Map;
import java.util.UUID;

/**
 * A place in a notice list: a group {@code rank} (smaller first), then time newest first, then id
 * (larger first). {@code nextBefore} is this value as opaque base64url text; the next page holds
 * the rows after it. Lists are sorted with {@link #ORDER} in Java (an event has at most a few dozen
 * notices), so a notice edited between two pages never repeats or skips the others.
 */
record NoticeCursor(int rank, long micros, UUID id) {

  static final Comparator<NoticeCursor> ORDER =
      Comparator.comparingInt(NoticeCursor::rank)
          .thenComparing(Comparator.comparingLong(NoticeCursor::micros).reversed())
          .thenComparing(Comparator.comparing(NoticeCursor::id).reversed());

  static NoticeCursor of(int rank, Instant at, UUID id) {
    return new NoticeCursor(rank, ChronoUnit.MICROS.between(Instant.EPOCH, at), id);
  }

  boolean isAfter(NoticeCursor other) {
    return ORDER.compare(this, other) > 0;
  }

  String encode() {
    String raw = rank + ":" + micros + ":" + id;
    return Base64.getUrlEncoder()
        .withoutPadding()
        .encodeToString(raw.getBytes(StandardCharsets.UTF_8));
  }

  /** Null for a missing value; {@code 400 VALIDATION_FAILED} field {@code before} when broken. */
  static NoticeCursor parse(String value) {
    if (value == null) {
      return null;
    }
    try {
      if (value.isEmpty() || value.length() > 200) {
        throw new IllegalArgumentException("length");
      }
      String raw = new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
      String[] parts = raw.split(":", -1);
      if (parts.length != 3) {
        throw new IllegalArgumentException("parts");
      }
      UUID id = UUID.fromString(parts[2]);
      if (!id.toString().equals(parts[2])) {
        throw new IllegalArgumentException("uuid");
      }
      return new NoticeCursor(Integer.parseInt(parts[0]), Long.parseLong(parts[1]), id);
    } catch (IllegalArgumentException broken) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "before"));
    }
  }
}
