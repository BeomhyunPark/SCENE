package app.scene.common.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class PageRequestTest {

  @Test
  void missingPageAndSizeUseTheContractDefaults() {
    PageRequest request = PageRequest.of(null, null);
    assertThat(request.number()).isZero();
    assertThat(request.size()).isEqualTo(50);
    assertThat(request.offset()).isZero();
  }

  @Test
  void sizeAtTheMaximumIsKept() {
    PageRequest request = PageRequest.of(2, 100);
    assertThat(request.number()).isEqualTo(2);
    assertThat(request.size()).isEqualTo(100);
    assertThat(request.offset()).isEqualTo(200);
  }

  @Test
  void sizeAboveTheMaximumIsRejectedAndNotClamped() {
    assertThatThrownBy(() -> PageRequest.of(0, 101))
        .isInstanceOf(SceneException.class)
        .extracting(thrown -> ((SceneException) thrown).code())
        .isEqualTo(ErrorCode.PAGE_SIZE_EXCEEDED);
  }

  @Test
  void negativePageAndNonPositiveSizeAreValidationFailures() {
    assertField("page", () -> PageRequest.of(-1, 50));
    assertField("size", () -> PageRequest.of(0, 0));
    assertField("size", () -> PageRequest.of(0, -1));
  }

  @Test
  void pageBodyUsesTheContractShape() {
    ItemPage<String> page = ItemPage.of(List.of("a"), PageRequest.of(0, 50), 328);
    assertThat(page.items()).containsExactly("a");
    assertThat(page.page().number()).isZero();
    assertThat(page.page().size()).isEqualTo(50);
    assertThat(page.page().totalItems()).isEqualTo(328);
    assertThat(page.page().totalPages()).isEqualTo(7);
  }

  @Test
  void emptyListHasNoPages() {
    ItemPage<String> page = ItemPage.of(List.of(), PageRequest.of(0, null), 0);
    assertThat(page.page().totalPages()).isZero();
  }

  @Test
  void partialLastPageStillCounts() {
    assertThat(ItemPage.of(List.of(), PageRequest.of(2, 50), 101).page().totalPages()).isEqualTo(3);
  }

  @Test
  void repeatedSortKeepsOnlyAllowListedFields() {
    List<SortOrder> orders =
        Sorts.parse(List.of("createdAt,desc", "name,asc"), Set.of("createdAt", "name"));
    assertThat(orders)
        .containsExactly(
            new SortOrder("createdAt", SortOrder.Direction.DESC),
            new SortOrder("name", SortOrder.Direction.ASC));
  }

  @Test
  void sortOutsideTheAllowListIsRejected() {
    assertField("sort", () -> Sorts.parse(List.of("secret,asc"), Set.of("name")));
    assertField("sort", () -> Sorts.parse(List.of("name,DESC"), Set.of("name")));
    assertField("sort", () -> Sorts.parse(List.of("name"), Set.of("name")));
    assertThat(Sorts.parse(List.of(), Set.of())).isEmpty();
  }

  @Test
  void pageItemsAreCopied() {
    List<String> source = new ArrayList<>(List.of("a"));
    ItemPage<String> page = ItemPage.of(source, PageRequest.of(0, 50), 1);
    source.add("b");
    assertThat(page.items()).containsExactly("a");
  }

  private static void assertField(String field, Runnable call) {
    assertThatThrownBy(call::run)
        .isInstanceOf(SceneException.class)
        .satisfies(
            thrown -> {
              SceneException scene = (SceneException) thrown;
              assertThat(scene.code()).isEqualTo(ErrorCode.VALIDATION_FAILED);
              assertThat(scene.details()).containsEntry("field", field);
            });
  }
}
