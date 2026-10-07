package app.scene.common.mybatis;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;
import org.junit.jupiter.api.Test;

class PageParamTest {

  private static final Map<String, String> ALLOWED = Map.of("occurredAt", "occurred_at");

  @Test
  void unknownColumnUsesTheDefaultOrder() {
    assertThat(PageParam.buildOrderByClause("status; drop", "ASC", ALLOWED, "id ASC"))
        .isEqualTo("id ASC");
    assertThat(PageParam.buildOrderByClause(null, "DESC", ALLOWED, "id ASC")).isEqualTo("id ASC");
  }

  @Test
  void allowedColumnKeepsOnlyAscOrDesc() {
    assertThat(PageParam.buildOrderByClause("occurredAt", "desc", ALLOWED, "id ASC"))
        .isEqualTo("occurred_at DESC");
    assertThat(PageParam.buildOrderByClause("name", "name; delete", ALLOWED, "id ASC"))
        .isEqualTo("id ASC");
    assertThat(PageParam.buildOrderByClause("occurredAt", "name; delete", ALLOWED, "id ASC"))
        .isEqualTo("occurred_at ASC");
  }

  @Test
  void missingAllowListIsRejected() {
    assertThatThrownBy(() -> PageParam.buildOrderByClause("name", "ASC", null, "id ASC"))
        .isInstanceOf(IllegalArgumentException.class);
  }
}
