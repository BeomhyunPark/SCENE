package app.scene.event.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** CSV cells, formula neutralizing, and the answer text rules of the original view (#233). */
class ApplicationCsvTest {

  private final JsonMapper json = JsonMapper.builder().build();

  @Test
  void fileStartsWithBomAndRowsEndInCrlf() {
    byte[] bytes = ApplicationCsv.write(List.of(List.of("제출 시각", "이름"), List.of("a", "김")));
    assertThat(Arrays.copyOf(bytes, 3)).containsExactly(0xEF, 0xBB, 0xBF);
    String text = new String(bytes, 3, bytes.length - 3, StandardCharsets.UTF_8);
    assertThat(text).isEqualTo("제출 시각,이름\r\na,김\r\n");
  }

  @Test
  void quotesCommaQuoteAndLineBreaks() {
    assertThat(ApplicationCsv.cell("a,b")).isEqualTo("\"a,b\"");
    assertThat(ApplicationCsv.cell("say \"hi\"")).isEqualTo("\"say \"\"hi\"\"\"");
    assertThat(ApplicationCsv.cell("line\nbreak")).isEqualTo("\"line\nbreak\"");
    assertThat(ApplicationCsv.cell("cr\rhere")).isEqualTo("\"cr\rhere\"");
    assertThat(ApplicationCsv.cell("plain 한글")).isEqualTo("plain 한글");
    assertThat(ApplicationCsv.cell(null)).isEmpty();
  }

  @Test
  void leadingFormulaCharactersBecomeText() {
    assertThat(ApplicationCsv.cell("=SUM(A1)")).isEqualTo("'=SUM(A1)");
    assertThat(ApplicationCsv.cell("+82")).isEqualTo("'+82");
    assertThat(ApplicationCsv.cell("-1")).isEqualTo("'-1");
    assertThat(ApplicationCsv.cell("@cmd")).isEqualTo("'@cmd");
    assertThat(ApplicationCsv.cell("\tx")).isEqualTo("'\tx");
    assertThat(ApplicationCsv.cell("\rx")).isEqualTo("\"'\rx\"");
    assertThat(ApplicationCsv.cell("=HYPERLINK(\"a\",\"b\")"))
        .isEqualTo("\"'=HYPERLINK(\"\"a\"\",\"\"b\"\")\"");
    assertThat(ApplicationCsv.cell("010-1234-5678")).isEqualTo("010-1234-5678");
    assertThat(ApplicationCsv.cell("a=b")).isEqualTo("a=b");
  }

  @Test
  void answersReadLikeTheOriginalView() {
    String options =
        """
        {"options": [
          {"optionId": "opt_a", "label": "전체", "group": null, "hidden": false},
          {"optionId": "opt_b", "label": "저녁", "group": "1일차", "hidden": false},
          {"optionId": "opt_c", "label": "옛 보기", "group": null, "hidden": true}
        ]}
        """;
    assertThat(text("SINGLE_CHOICE", options, "{\"optionId\":\"opt_a\"}")).isEqualTo("전체");
    assertThat(text("DROPDOWN", options, "{\"other\":\"직접\"}")).isEqualTo("기타: 직접");
    assertThat(text("SINGLE_CHOICE", options, "{\"optionId\":\"opt_x\"}")).isEqualTo("알 수 없는 보기");
    assertThat(
            text("MULTI_CHOICE", options, "{\"optionIds\":[\"opt_b\",\"opt_c\"],\"other\":\"간식\"}"))
        .isEqualTo("1일차 저녁, 옛 보기 (숨김), 기타: 간식");
    assertThat(text("MULTI_CHOICE", options, "{\"optionIds\":[]}")).isEmpty();
    assertThat(text("DATE", "{}", "{\"date\":\"2027-01-22\"}")).isEqualTo("2027. 1. 22.");
    assertThat(text("DATE", "{}", "{\"dateTime\":\"2027-01-22T09:05\"}"))
        .isEqualTo("2027. 1. 22. 09:05");
    assertThat(text("DATE_RANGE", "{}", "{\"start\":\"2027-01-22\",\"end\":\"2027-01-24\"}"))
        .isEqualTo("2027. 1. 22. ~ 2027. 1. 24.");
    assertThat(text("NUMBER", "{\"unit\":\"명\"}", "{\"number\":3}")).isEqualTo("3 명");
    assertThat(text("NUMBER", "{\"unit\":null}", "{\"number\":-2}")).isEqualTo("-2");
    assertThat(text("YES_NO", "{\"style\":\"YES_NO\"}", "{\"value\":true}")).isEqualTo("예");
    assertThat(text("YES_NO", "{\"style\":\"YES_NO\"}", "{\"value\":false}")).isEqualTo("아니오");
    assertThat(text("YES_NO", "{\"style\":\"CONSENT\"}", "{\"value\":true}")).isEqualTo("동의함");
    assertThat(text("YES_NO", "{\"style\":\"CONSENT\",\"noLabel\":\"\"}", "{\"value\":false}"))
        .isEqualTo("동의 안 함");
    assertThat(text("YES_NO", "{\"yesLabel\":\"탑니다\"}", "{\"value\":true}")).isEqualTo("탑니다");
    assertThat(text("SHORT_TEXT", "{}", "{\"text\":\"김\"}")).isEqualTo("김");
    assertThat(text("LONG_TEXT", "{}", "{}")).isEmpty();
    assertThat(AnswerText.label("옛 질문", true)).isEqualTo("옛 질문 (숨김)");
    assertThat(AnswerText.label("이름", false)).isEqualTo("이름");
  }

  @Test
  void fileNameDropsPathCharactersAndKeepsKorean() {
    Instant at = Instant.parse("2026-11-17T05:30:00Z");
    assertThat(ApplicationExportService.fileName("2027 겨울/수련회:*", at))
        .isEqualTo("2027 겨울수련회_신청자_20261117-1430.csv");
    assertThat(ApplicationExportService.fileName("  ", at)).isEqualTo("신청자_20261117-1430.csv");
  }

  private String text(String type, String config, String value) {
    JsonNode parsedConfig = json.readTree(config);
    return AnswerText.format(type, parsedConfig, json.readTree(value));
  }
}
