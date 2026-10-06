package app.scene.common.web;

import java.util.List;

/** List body: {@code items} plus {@code page}. */
public record ItemPage<T>(List<T> items, PageMeta page) {

  public ItemPage {
    items = List.copyOf(items);
  }

  public static <T> ItemPage<T> of(List<T> items, PageRequest request, long totalItems) {
    if (totalItems < 0) {
      throw new IllegalArgumentException("totalItems must be zero or more");
    }
    int totalPages = 0;
    if (totalItems > 0) {
      long pages = (totalItems + request.size() - 1) / request.size();
      if (pages > Integer.MAX_VALUE) {
        throw new IllegalArgumentException("totalPages does not fit an int");
      }
      totalPages = (int) pages;
    }
    return new ItemPage<>(
        items, new PageMeta(request.number(), request.size(), totalItems, totalPages));
  }
}
