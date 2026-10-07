package app.scene.common.mybatis;

import java.util.Map;

/**
 * Paging and a server-built order clause. The clause is included from {@code CommonMapper} and is
 * never assembled in XML.
 */
public final class PageParam {

  private final Integer offset;
  private final Integer size;
  private final String orderByClause;

  private PageParam(Integer offset, Integer size, String orderByClause) {
    this.offset = offset;
    this.size = size;
    this.orderByClause = orderByClause;
  }

  public static PageParam of(Integer offset, Integer size, String orderByClause) {
    return new PageParam(offset, size, orderByClause);
  }

  /**
   * Allows only columns present in {@code allowed}. Anything else, including a blank request, uses
   * {@code defaultOrder}. Direction is ASC unless it is exactly DESC.
   */
  public static String buildOrderByClause(
      String requestedColumn, String direction, Map<String, String> allowed, String defaultOrder) {
    if (allowed == null || defaultOrder == null || defaultOrder.isBlank()) {
      throw new IllegalArgumentException("allowed columns and a default order are required");
    }
    String column = requestedColumn == null ? null : allowed.get(requestedColumn);
    if (column == null) {
      return defaultOrder;
    }
    String way = "DESC".equalsIgnoreCase(direction) ? "DESC" : "ASC";
    return column + " " + way;
  }

  public Integer getOffset() {
    return offset;
  }

  public Integer getSize() {
    return size;
  }

  public String getOrderByClause() {
    return orderByClause;
  }
}
