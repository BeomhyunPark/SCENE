package app.scene.event.form;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.scene.common.error.SceneException;
import org.junit.jupiter.api.Test;

class CompletionNoticeTest {

  @Test
  void keepsLineBreaksAndTextAsTyped() {
    assertThat(CompletionNotice.normalize(" a\r\nb\rc\n\n<a href=x>d</a> \n"))
        .isEqualTo("a\nb\nc\n\n<a href=x>d</a>");
    assertThat(CompletionNotice.normalize("탭\t그대로")).isEqualTo("탭\t그대로");
  }

  @Test
  void blankIsNoNotice() {
    assertThat(CompletionNotice.normalize("")).isNull();
    assertThat(CompletionNotice.normalize(" \r\n\t ")).isNull();
  }

  @Test
  void countsCodePointsAndRejectsOtherControlCharacters() {
    assertThat(CompletionNotice.normalize("😀".repeat(CompletionNotice.MAX))).hasSize(2000);
    assertThatThrownBy(() -> CompletionNotice.normalize("가".repeat(CompletionNotice.MAX + 1)))
        .isInstanceOf(SceneException.class);
    assertThatThrownBy(() -> CompletionNotice.normalize("a\u0000b"))
        .isInstanceOf(SceneException.class);
  }
}
