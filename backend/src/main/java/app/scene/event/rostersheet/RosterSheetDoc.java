package app.scene.event.rostersheet;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * The sheet document and its operations (#508). Shape:
 *
 * <pre>
 * { "columns": [{"id", "label", "after"}], "rows": [{"id"}],
 *   "cells": {"rowKey|colKey": {"v": "text or =formula", "f": {format}}},
 *   "rules": [{"id", "col", "op", "value", "color", "fill", "b"}] }
 * </pre>
 *
 * A row key is {@code p:<participantId>} (kept across revisions) or {@code r:<rowId>} for an
 * operator row. A column key is {@code c:<columnId>} for an operator column or the screen's id of
 * another column (a field id, {@code status}, …). A participant row takes a value only in an
 * operator column (its other cells are answers); an operator row takes one in any column. A format
 * goes to any cell. Operations are applied in order; a later write to the same cell wins. Formulas
 * are stored as the screen sends them and are evaluated by the screen.
 */
final class RosterSheetDoc {

  static final int COLUMNS_MAX = 100;
  static final int ROWS_MAX = 2_000;
  static final int CELLS_MAX = 100_000;
  static final int RULES_MAX = 100;
  static final int OPS_MAX = 5_000;
  static final int LABEL_MAX = 100;
  static final int VALUE_MAX = 5_000;

  private static final Pattern ID = Pattern.compile("[A-Za-z0-9_-]{1,40}");
  private static final Pattern ROW_KEY =
      Pattern.compile("p:[0-9a-fA-F-]{36}|r:[A-Za-z0-9_-]{1,40}");
  private static final Pattern COL_KEY = Pattern.compile("[A-Za-z0-9_:.-]{1,80}");
  private static final Pattern COLOR = Pattern.compile("#[0-9a-fA-F]{6}");
  private static final Set<String> FLAGS = Set.of("b", "i", "s", "u");
  private static final Set<String> ALIGN = Set.of("left", "center", "right");
  private static final Set<String> RULE_OPS =
      Set.of("empty", "notEmpty", "eq", "neq", "contains", "notContains", "gt", "gte", "lt", "lte");

  private final ObjectNode doc;
  private final JsonMapper json;

  private RosterSheetDoc(ObjectNode doc, JsonMapper json) {
    this.doc = doc;
    this.json = json;
  }

  static RosterSheetDoc empty(JsonMapper json) {
    ObjectNode doc = json.createObjectNode();
    doc.putArray("columns");
    doc.putArray("rows");
    doc.putObject("cells");
    doc.putArray("rules");
    return new RosterSheetDoc(doc, json);
  }

  static RosterSheetDoc parse(String text, JsonMapper json) {
    RosterSheetDoc out = empty(json);
    JsonNode stored = json.readTree(text);
    if (stored instanceof ObjectNode object) {
      for (String key : List.of("columns", "rows", "cells", "rules")) {
        if (object.get(key) != null) {
          out.doc.set(key, object.get(key));
        }
      }
    }
    return out;
  }

  ObjectNode node() {
    return doc;
  }

  String text() {
    return json.writeValueAsString(doc);
  }

  /** Applies {@code body.ops}; returns how many were applied. */
  int apply(JsonNode body) {
    JsonNode ops = body == null || !body.isObject() ? null : body.get("ops");
    if (ops == null || !ops.isArray() || ops.isEmpty() || ops.size() > OPS_MAX) {
      throw invalid("ops");
    }
    for (JsonNode op : ops) {
      applyOne(op);
    }
    if (columns().size() > COLUMNS_MAX) throw invalid("columns");
    if (rows().size() > ROWS_MAX) throw invalid("rows");
    if (cells().size() > CELLS_MAX) throw invalid("cells");
    return ops.size();
  }

  private void applyOne(JsonNode op) {
    if (op == null || !op.isObject()) throw invalid("ops");
    switch (text(op, "op", 40)) {
      case "addColumn" -> addColumn(op);
      case "updateColumn" -> updateColumn(op);
      case "deleteColumn" -> deleteColumn(op);
      case "addRow" -> addRow(op);
      case "deleteRow" -> deleteRow(op);
      case "setCell" -> setCell(op);
      case "setRules" -> setRules(op);
      default -> throw invalid("op");
    }
  }

  private void addColumn(JsonNode op) {
    String id = id(op);
    if (indexOf(columns(), id) >= 0) throw invalid("id");
    ObjectNode column = json.createObjectNode();
    column.put("id", id);
    column.put("label", label(op));
    String after = optionalText(op, "after");
    if (after != null && !COL_KEY.matcher(after).matches()) throw invalid("after");
    if (after == null) column.putNull("after");
    else column.put("after", after);
    columns().add(column);
  }

  private void updateColumn(JsonNode op) {
    int at = indexOf(columns(), id(op));
    if (at < 0) throw missing();
    ObjectNode column = (ObjectNode) columns().get(at);
    if (op.has("label")) column.put("label", label(op));
  }

  private void deleteColumn(JsonNode op) {
    String id = id(op);
    int at = indexOf(columns(), id);
    if (at < 0) throw missing();
    columns().remove(at);
    String key = "c:" + id;
    removeCells(key, false);
    ArrayNode rules = rules();
    for (int i = rules.size() - 1; i >= 0; i--) {
      if (key.equals(rules.get(i).path("col").asString(""))) rules.remove(i);
    }
    for (JsonNode column : columns()) {
      if (key.equals(column.path("after").asString(""))) ((ObjectNode) column).putNull("after");
    }
  }

  private void addRow(JsonNode op) {
    String id = id(op);
    if (indexOf(rows(), id) >= 0) throw invalid("id");
    ObjectNode row = json.createObjectNode();
    row.put("id", id);
    JsonNode index = op.get("index");
    if (index == null || index.isNull()) {
      rows().add(row);
      return;
    }
    if (!index.isIntegralNumber() || index.asInt() < 0 || index.asInt() > rows().size()) {
      throw invalid("index");
    }
    rows().insert(index.asInt(), row);
  }

  private void deleteRow(JsonNode op) {
    String id = id(op);
    int at = indexOf(rows(), id);
    if (at < 0) throw missing();
    rows().remove(at);
    removeCells("r:" + id, true);
  }

  private void setCell(JsonNode op) {
    String row = text(op, "row", 80);
    String col = text(op, "col", 80);
    if (!ROW_KEY.matcher(row).matches()) throw invalid("row");
    if (!COL_KEY.matcher(col).matches()) throw invalid("col");
    if (row.startsWith("r:") && indexOf(rows(), row.substring(2)) < 0) throw missing();
    String key = row + "|" + col;
    ObjectNode cell =
        cells().get(key) instanceof ObjectNode stored ? stored.deepCopy() : json.createObjectNode();
    if (op.has("value")) {
      JsonNode value = op.get("value");
      boolean operatorColumn = col.startsWith("c:") && indexOf(columns(), col.substring(2)) >= 0;
      if (!operatorColumn && !row.startsWith("r:")) {
        throw invalid("col");
      }
      if (value == null || value.isNull() || (value.isString() && value.asString().isEmpty())) {
        cell.remove("v");
      } else if (value.isString() && value.asString().length() <= VALUE_MAX) {
        cell.put("v", value.asString());
      } else {
        throw invalid("value");
      }
    }
    if (op.has("format")) {
      ObjectNode format = format(op.get("format"));
      if (format == null || format.isEmpty()) cell.remove("f");
      else cell.set("f", format);
    }
    if (cell.isEmpty()) cells().remove(key);
    else cells().set(key, cell);
  }

  private void setRules(JsonNode op) {
    JsonNode list = op.get("rules");
    if (list == null || !list.isArray() || list.size() > RULES_MAX) throw invalid("rules");
    ArrayNode out = json.createArrayNode();
    for (JsonNode rule : list) {
      if (!rule.isObject()) throw invalid("rules");
      ObjectNode clean = json.createObjectNode();
      clean.put("id", id(rule));
      String col = text(rule, "col", 80);
      if (!COL_KEY.matcher(col).matches()) throw invalid("rules");
      clean.put("col", col);
      String ruleOp = text(rule, "op", 20);
      if (!RULE_OPS.contains(ruleOp)) throw invalid("rules");
      clean.put("op", ruleOp);
      String value = optionalText(rule, "value");
      clean.put("value", value == null ? "" : value);
      if (value != null && value.length() > 200) throw invalid("rules");
      for (String colorKey : List.of("color", "fill")) {
        String color = optionalText(rule, colorKey);
        if (color == null) continue;
        if (!COLOR.matcher(color).matches()) throw invalid("rules");
        clean.put(colorKey, color);
      }
      if (rule.path("b").asBoolean(false)) clean.put("b", true);
      out.add(clean);
    }
    doc.set("rules", out);
  }

  private ObjectNode format(JsonNode raw) {
    if (raw == null || raw.isNull()) return null;
    if (!raw.isObject()) throw invalid("format");
    ObjectNode out = json.createObjectNode();
    for (Map.Entry<String, JsonNode> entry : raw.properties()) {
      String key = entry.getKey();
      JsonNode value = entry.getValue();
      if (value == null || value.isNull()) continue;
      if (FLAGS.contains(key) && value.isBoolean()) {
        if (value.asBoolean()) out.put(key, true);
      } else if ((key.equals("color") || key.equals("fill"))
          && value.isString()
          && COLOR.matcher(value.asString()).matches()) {
        out.put(key, value.asString());
      } else if (key.equals("align") && value.isString() && ALIGN.contains(value.asString())) {
        out.put(key, value.asString());
      } else {
        throw invalid("format");
      }
    }
    return out;
  }

  private void removeCells(String key, boolean row) {
    List<String> gone = new ArrayList<>();
    for (Map.Entry<String, JsonNode> entry : cells().properties()) {
      String[] parts = entry.getKey().split("\\|", 2);
      if (parts.length == 2 && key.equals(row ? parts[0] : parts[1])) gone.add(entry.getKey());
    }
    gone.forEach(cells()::remove);
  }

  private ArrayNode columns() {
    return (ArrayNode) doc.get("columns");
  }

  private ArrayNode rows() {
    return (ArrayNode) doc.get("rows");
  }

  private ObjectNode cells() {
    return (ObjectNode) doc.get("cells");
  }

  private ArrayNode rules() {
    return (ArrayNode) doc.get("rules");
  }

  private static int indexOf(ArrayNode list, String id) {
    for (int i = 0; i < list.size(); i++) {
      if (id.equals(list.get(i).path("id").asString(""))) return i;
    }
    return -1;
  }

  private static String id(JsonNode op) {
    String id = text(op, "id", 40);
    if (!ID.matcher(id).matches()) throw invalid("id");
    return id;
  }

  private static String label(JsonNode op) {
    JsonNode node = op.get("label");
    if (node == null || !node.isString()) throw invalid("label");
    String label = node.asString().strip();
    if (label.isEmpty() || label.codePointCount(0, label.length()) > LABEL_MAX) {
      throw invalid("label");
    }
    return label;
  }

  private static String text(JsonNode op, String key, int max) {
    JsonNode node = op.get(key);
    if (node == null || !node.isString() || node.asString().isEmpty()) throw invalid(key);
    if (node.asString().length() > max) throw invalid(key);
    return node.asString();
  }

  private static String optionalText(JsonNode op, String key) {
    JsonNode node = op.get(key);
    if (node == null || node.isNull()) return null;
    if (!node.isString()) throw invalid(key);
    return node.asString();
  }

  private static SceneException invalid(String field) {
    return new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", field));
  }

  private static SceneException missing() {
    return new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
  }
}
