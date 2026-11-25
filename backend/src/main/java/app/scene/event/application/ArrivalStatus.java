package app.scene.event.application;

/**
 * Where one submitted participant stands on the arrival roster (E4 #456, DEC-087 Follow-up). The
 * rule is {@code MealTally.standing}: the same cursor and due slots as the meal counts, so {@link
 * #OVERDUE} names exactly the next meal's "아직 안 옴".
 */
public enum ArrivalStatus {
  /** Checked in now. */
  ARRIVED,
  /** Not checked in; attends the next meal and its due slot has passed. */
  OVERDUE,
  /** Not checked in; due at a slot that has not passed. */
  COMING,
  /**
   * Not checked in; nothing left to come for (the slots passed, or the next meal is not theirs).
   */
  PASSED,
  /** Not checked in; attended slots unknown. */
  UNKNOWN
}
