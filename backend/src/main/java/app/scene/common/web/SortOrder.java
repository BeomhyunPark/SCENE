package app.scene.common.web;

/** One allow-listed sort. {@code field} is the API name, not a SQL fragment. */
public record SortOrder(String field, Direction direction) {

  public enum Direction {
    ASC,
    DESC
  }

  public SortOrder {
    if (field == null || field.isBlank()) {
      throw new IllegalArgumentException("sort field is required");
    }
    if (direction == null) {
      throw new IllegalArgumentException("sort direction is required");
    }
  }
}
