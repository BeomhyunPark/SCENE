package app.scene.event.notice;

/**
 * State command response. {@code result} is {@code PUBLISHED}, {@code ALREADY_PUBLISHED}, {@code
 * ARCHIVED}, {@code ALREADY_ARCHIVED} or {@code UNARCHIVED}.
 */
public record NoticeCommandResult(String result, Notice notice, int notifiedCount) {

  public static final String PUBLISHED = "PUBLISHED";
  public static final String ALREADY_PUBLISHED = "ALREADY_PUBLISHED";
  public static final String ARCHIVED = "ARCHIVED";
  public static final String ALREADY_ARCHIVED = "ALREADY_ARCHIVED";
  public static final String UNARCHIVED = "UNARCHIVED";
}
