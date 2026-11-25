package app.scene.event.room;

import java.util.List;

/**
 * A participant's lodging state for rooms (api.md "숙소"), from {@link
 * app.scene.event.form.MealSlots#lodgingNights}, the same rule as the summary's lodging rows and
 * the group leader's {@code lodgingNights}.
 */
public enum Lodging {
  /** At least one night. */
  LODGING,
  /** No night: cannot be put in a room (user decision 2026-11-20). */
  NOT_LODGING,
  /** Unknown (no period, no usable range, no LODGING question): not blocked. */
  UNKNOWN;

  public static Lodging of(List<Integer> nights) {
    if (nights == null) {
      return UNKNOWN;
    }
    return nights.isEmpty() ? NOT_LODGING : LODGING;
  }
}
