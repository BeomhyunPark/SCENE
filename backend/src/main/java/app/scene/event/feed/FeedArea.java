package app.scene.event.feed;

/**
 * An event-scope refresh value of {@code participant_feed_versions} (DEC-080 §4). Each area is one
 * column; {@link ParticipantFeedVersions#bump} adds 1 to it.
 *
 * <ul>
 *   <li>{@code HOME}: event name, lifecycle transition, completion notice ({@code
 *       OperatorEventCommandService}, {@code EventLifecycleService}, {@code OperatorFormService})
 *   <li>{@code GROUPS}: group publication {@code PUBLISHED} ({@code GroupService.publish})
 *   <li>{@code SCHEDULE}: schedule publication {@code PUBLISHED} only (schedule, C)
 *   <li>{@code NOTICES}: a notice whose audience before or after includes participants is
 *       published, edited, archived, unarchived or (un)pinned (notices, D)
 *   <li>{@code ROOMS}: room assignment published (G1)
 *   <li>{@code MEAL_ORDER}: meal order published (H1)
 * </ul>
 */
public enum FeedArea {
  HOME("home"),
  SCHEDULE("schedule"),
  NOTICES("notices"),
  GROUPS("groups"),
  ROOMS("rooms"),
  MEAL_ORDER("meal_order");

  private final String column;

  FeedArea(String column) {
    this.column = column;
  }

  /** The column name. Only these fixed values reach the SQL. */
  public String column() {
    return column;
  }
}
