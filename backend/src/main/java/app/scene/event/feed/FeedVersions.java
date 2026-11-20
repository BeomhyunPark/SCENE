package app.scene.event.feed;

/**
 * The event-scope refresh values of one event. All 0 before the first bump. Values are compared for
 * equality only; a value above 0 means the area changed at least once.
 */
public record FeedVersions(
    long home, long schedule, long notices, long groups, long rooms, long mealOrder) {

  public static final FeedVersions ZERO = new FeedVersions(0, 0, 0, 0, 0, 0);

  public long of(FeedArea area) {
    return switch (area) {
      case HOME -> home;
      case SCHEDULE -> schedule;
      case NOTICES -> notices;
      case GROUPS -> groups;
      case ROOMS -> rooms;
      case MEAL_ORDER -> mealOrder;
    };
  }
}
