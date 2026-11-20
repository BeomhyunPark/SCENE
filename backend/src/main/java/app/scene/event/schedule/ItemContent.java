package app.scene.event.schedule;

import app.scene.event.audience.Audience;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * The comparable content of one item (schedule-contract §5 "비교하는 필드"). Two items with the same
 * content are {@code UNCHANGED} whatever their versions.
 */
record ItemContent(
    int day,
    String startTime,
    String endTime,
    String title,
    String place,
    String description,
    String category,
    Audience audience,
    String slotId,
    int sortOrder) {

  /** Field names in the order {@code fields} lists them. */
  static final List<String> FIELDS =
      List.of(
          "day",
          "startTime",
          "endTime",
          "title",
          "place",
          "description",
          "category",
          "audience",
          "slotId",
          "sortOrder");

  /** Fields whose earlier value goes to {@code change.previous}. */
  static final List<String> TRACKED = List.of("day", "startTime", "endTime", "place");

  /** Names of fields that differ from {@code other}, in {@link #FIELDS} order. */
  List<String> diff(ItemContent other) {
    List<String> out = new ArrayList<>();
    for (String field : FIELDS) {
      if (!Objects.equals(value(field), other.value(field))) {
        out.add(field);
      }
    }
    return out;
  }

  Object value(String field) {
    return switch (field) {
      case "day" -> day;
      case "startTime" -> startTime;
      case "endTime" -> endTime;
      case "title" -> title;
      case "place" -> place;
      case "description" -> description;
      case "category" -> category;
      case "audience" -> audience;
      case "slotId" -> slotId;
      case "sortOrder" -> sortOrder;
      default -> throw new IllegalArgumentException(field);
    };
  }
}
