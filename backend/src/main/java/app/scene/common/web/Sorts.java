package app.scene.common.web;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Parses repeated {@code sort} values such as {@code createdAt,desc}. A field outside {@code
 * allowed} is rejected. This class does not build SQL.
 */
public final class Sorts {

  private Sorts() {}

  public static List<SortOrder> parse(List<String> requested, Set<String> allowed) {
    if (requested == null || requested.isEmpty()) {
      return List.of();
    }
    if (allowed == null) {
      throw new IllegalArgumentException("allowed sort fields are required");
    }
    List<SortOrder> orders = new ArrayList<>();
    for (String value : requested) {
      orders.add(one(value, allowed));
    }
    return List.copyOf(orders);
  }

  private static SortOrder one(String value, Set<String> allowed) {
    if (value == null || value.isBlank()) {
      throw invalid();
    }
    int comma = value.indexOf(',');
    if (comma <= 0 || comma != value.lastIndexOf(',') || comma == value.length() - 1) {
      throw invalid();
    }
    String field = value.substring(0, comma);
    String direction = value.substring(comma + 1);
    if (!allowed.contains(field)) {
      throw invalid();
    }
    if ("asc".equals(direction)) {
      return new SortOrder(field, SortOrder.Direction.ASC);
    }
    if ("desc".equals(direction)) {
      return new SortOrder(field, SortOrder.Direction.DESC);
    }
    throw invalid();
  }

  private static SceneException invalid() {
    return new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "sort"));
  }
}
