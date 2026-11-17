package app.scene.event.application;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * RFC 4180 CSV with a UTF-8 byte order mark, so Excel reads Korean text (#233). Rows end in CRLF. A
 * cell is quoted when it holds a comma, a quote, CR or LF, and quotes inside are doubled. A cell
 * that starts with {@code =}, {@code +}, {@code -}, {@code @}, tab or CR gets a leading {@code '}
 * so a spreadsheet shows it as text and does not run it as a formula. Headers get the same
 * treatment because question titles are operator text.
 */
final class ApplicationCsv {

  private static final byte[] BOM = {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF};

  private ApplicationCsv() {}

  static byte[] write(List<List<String>> rows) {
    StringBuilder out = new StringBuilder();
    for (List<String> row : rows) {
      for (int i = 0; i < row.size(); i++) {
        if (i > 0) {
          out.append(',');
        }
        out.append(cell(row.get(i)));
      }
      out.append("\r\n");
    }
    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    bytes.writeBytes(BOM);
    bytes.writeBytes(out.toString().getBytes(StandardCharsets.UTF_8));
    return bytes.toByteArray();
  }

  static String cell(String raw) {
    String value = neutralize(raw == null ? "" : raw);
    boolean quote =
        value.indexOf(',') >= 0
            || value.indexOf('"') >= 0
            || value.indexOf('\r') >= 0
            || value.indexOf('\n') >= 0;
    if (!quote) {
      return value;
    }
    return '"' + value.replace("\"", "\"\"") + '"';
  }

  /** OWASP CSV injection: a leading formula character becomes text with a {@code '} prefix. */
  static String neutralize(String value) {
    if (value.isEmpty()) {
      return value;
    }
    char first = value.charAt(0);
    if (first == '='
        || first == '+'
        || first == '-'
        || first == '@'
        || first == '\t'
        || first == '\r') {
      return "'" + value;
    }
    return value;
  }
}
