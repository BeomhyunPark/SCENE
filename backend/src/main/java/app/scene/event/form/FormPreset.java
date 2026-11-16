package app.scene.event.form;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.function.Function;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

/**
 * Builds the generated questions for one {@link FormSetup} and event period (DEC-070). Every
 * question has a fixed key, and every option a fixed id computed from its meaning (attendance kind,
 * day number, meal), so later counts find an answer after the operator rewords it. The output uses
 * only the nine DEC-068 types, options, and {@code showWhen}.
 *
 * <p>The attendance and transport questions always list every option and hide the ones the setup
 * turned off. Conditions that point at them stay the same when a switch changes, so the change
 * still works after applications arrive.
 */
public final class FormPreset {

  /** Every preset key in the order the questions are asked. */
  public static final List<String> ORDER =
      List.of(
          "GENDER",
          "MIDDLE_GROUP",
          "CELL",
          "ATTENDANCE",
          "ARRIVAL_AT",
          "DEPARTURE_AT",
          "LODGING",
          "MEALS",
          "PARTIAL_NOTE",
          "TRANSPORT_IN",
          "SHUTTLE_IN",
          "CARPOOL_OFFER",
          "CARPOOL_SEATS",
          "CARPOOL_AREA",
          "CARPOOL_NOTE",
          "MOBILITY_IN",
          "TRANSPORT_OUT",
          "SHUTTLE_OUT",
          "MOBILITY_OUT",
          "CONSENT");

  static final String FULL = "opt_full";
  static final String PARTIAL = "opt_partial";
  static final String WORSHIP = "opt_worship";
  static final String GROUP_BUS = "opt_group";
  static final String SHUTTLE = "opt_shuttle";
  static final String CAR = "opt_car";
  static final String PUBLIC = "opt_public";
  static final String SUPPORT = "opt_support";

  private static final JsonNodeFactory NODES = JsonNodeFactory.instance;
  private static final String[] WEEKDAYS = {"월", "화", "수", "목", "금", "토", "일"};
  private static final String[] ORDINALS = {
    "첫째", "둘째", "셋째", "넷째", "다섯째", "여섯째", "일곱째", "여덟째", "아홉째"
  };
  private static final String SUPPORT_NOTICE = "이동 지원은 매칭이 보장되지 않으며, 탑승 위치가 희망 지역과 달라질 수 있습니다.";

  private FormPreset() {}

  /** One generated question with its final settings. {@code showWhen} is null when always shown. */
  public record Question(
      String key,
      String label,
      String description,
      AnswerType type,
      boolean required,
      ObjectNode config,
      JsonNode showWhen) {

    /** The generated wording. A later setup change keeps any text that differs from this. */
    public ObjectNode defaults() {
      ObjectNode out = NODES.objectNode();
      out.put("active", true);
      out.put("label", label);
      if (description == null) {
        out.putNull("description");
      } else {
        out.put("description", description);
      }
      out.put("required", required);
      JsonNode placeholder = config.get("placeholder");
      if (placeholder == null) {
        out.putNull("placeholder");
      } else {
        out.set("placeholder", placeholder);
      }
      ObjectNode options = out.putObject("options");
      JsonNode list = config.get("options");
      if (list != null) {
        for (JsonNode option : list) {
          options.put(option.get("optionId").asString(), option.get("label").asString());
        }
      }
      return out;
    }
  }

  /**
   * The questions for {@code setup}, in {@link #ORDER}. {@code ids} gives the field id for a preset
   * key, for existing and new questions alike.
   */
  public static List<Question> generate(
      FormSetup setup, LocalDate start, LocalDate end, Function<String, UUID> ids) {
    List<Question> out = new ArrayList<>();
    int days = FormSetup.days(start, end);
    boolean attendance = setup.asksAttendance();

    if (setup.gender()) {
      ArrayNode options = NODES.arrayNode();
      options.add(option("opt_female", "여성", null, false, null));
      options.add(option("opt_male", "남성", null, false, null));
      out.add(
          new Question(
              "GENDER", "성별", null, AnswerType.SINGLE_CHOICE, true, single(options, true), null));
    }
    if (setup.middleGroup()) {
      out.add(
          new Question(
              "MIDDLE_GROUP",
              "중그룹",
              "소속 중그룹이 있으면 적어주세요.",
              AnswerType.SHORT_TEXT,
              false,
              shortText(50),
              null));
    }
    if (setup.cell()) {
      out.add(
          new Question(
              "CELL", "셀", "소속 셀이 있으면 적어주세요.", AnswerType.SHORT_TEXT, false, shortText(50), null));
    }

    if (attendance) {
      ArrayNode options = NODES.arrayNode();
      options.add(option(FULL, "전체 참석", null, false, null));
      options.add(option(PARTIAL, "부분 참석", null, !setup.partial(), null));
      options.add(option(WORSHIP, "집회만 참석", null, !setup.worshipOnly(), null));
      out.add(
          new Question(
              "ATTENDANCE",
              "참석 방식",
              null,
              AnswerType.SINGLE_CHOICE,
              true,
              single(options, true),
              null));
    }
    JsonNode whenPartial = attendance ? when(ids, "ATTENDANCE", PARTIAL) : null;
    if (setup.partial()) {
      out.add(
          new Question(
              "ARRIVAL_AT",
              "수련회장에 언제 도착할 예정인가요?",
              null,
              AnswerType.DATE,
              true,
              dateTime(start, end),
              whenPartial));
      out.add(
          new Question(
              "DEPARTURE_AT",
              "수련회장에서 언제 출발할 예정인가요?",
              null,
              AnswerType.DATE,
              true,
              dateTime(start, end),
              whenPartial));
      if (days > 1) {
        ArrayNode nights = NODES.arrayNode();
        for (int night = 1; night < days; night++) {
          LocalDate date = start.plusDays(night - 1L);
          nights.add(
              option(
                  "opt_n" + night,
                  ORDINALS[night - 1] + " 밤 (" + dayLabel(date) + ")",
                  null,
                  false,
                  null));
        }
        out.add(
            new Question(
                "LODGING",
                "숙박하는 밤을 모두 골라주세요",
                "숙박하지 않으면 비워 두세요.",
                AnswerType.MULTI_CHOICE,
                false,
                multi(nights),
                whenPartial));
      }
    }
    if (attendance) {
      ArrayNode cells = NODES.arrayNode();
      for (int day = 1; day <= days; day++) {
        FormSetup.Day slots = setup.schedule().get(day - 1);
        String group = dayLabel(start.plusDays(day - 1L));
        if (slots.breakfast()) {
          cells.add(option("opt_d" + day + "_breakfast", "아침", group, false, null));
        }
        if (slots.lunch()) {
          cells.add(option("opt_d" + day + "_lunch", "점심", group, false, null));
        }
        if (slots.dinner()) {
          cells.add(option("opt_d" + day + "_dinner", "저녁", group, false, null));
        }
        if (slots.worship()) {
          cells.add(option("opt_d" + day + "_worship", "집회", group, false, null));
        }
      }
      if (!cells.isEmpty()) {
        out.add(
            new Question(
                "MEALS",
                "참석할 프로그램과 식사를 선택해주세요",
                "식수 인원 확인을 위해 식사도 빠짐없이 골라주세요.",
                AnswerType.MULTI_CHOICE,
                true,
                multi(cells),
                when(ids, "ATTENDANCE", PARTIAL, WORSHIP)));
      }
    }
    if (setup.partial()) {
      out.add(
          new Question(
              "PARTIAL_NOTE",
              "운영진이 알아야 할 부분 참석 메모가 있나요?",
              null,
              AnswerType.LONG_TEXT,
              false,
              longText(),
              whenPartial));
    }

    if (setup.anyTransport()) {
      transport(out, setup, start, days, attendance, ids);
    }

    ObjectNode consent = NODES.objectNode();
    consent.put("style", "CONSENT");
    consent.putNull("yesLabel");
    consent.putNull("noLabel");
    out.add(
        new Question(
            "CONSENT",
            "개인정보 수집·이용에 동의합니다",
            "입력한 정보는 신청 접수와 행사 운영(조 배정, 숙박·식사·이동 준비, 현장 확인)에만 사용합니다.",
            AnswerType.YES_NO,
            true,
            consent,
            null));
    return out;
  }

  private static void transport(
      List<Question> out,
      FormSetup setup,
      LocalDate start,
      int days,
      boolean attendance,
      Function<String, UUID> ids) {
    // 집회 차량 runs only on days with a worship service, and only partial and worship-only
    // participants ride it. Without an attendance question everyone attends in full.
    List<Integer> worshipDays = new ArrayList<>();
    for (int day = 1; day <= days; day++) {
      if (setup.schedule().get(day - 1).worship()) {
        worshipDays.add(day);
      }
    }
    boolean shuttle = setup.worshipShuttle() && attendance && !worshipDays.isEmpty();
    JsonNode forBus = attendance ? when(ids, "ATTENDANCE", FULL, PARTIAL) : null;
    JsonNode forShuttle = attendance ? when(ids, "ATTENDANCE", PARTIAL, WORSHIP) : null;

    ArrayNode in = NODES.arrayNode();
    in.add(option(GROUP_BUS, "단체 이동 차량", null, !setup.groupBus(), forBus));
    in.add(option(SHUTTLE, "집회 차량", null, !shuttle, forShuttle));
    in.add(option(CAR, "자차", null, !setup.car(), null));
    in.add(option(PUBLIC, "대중교통", null, !setup.publicTransit(), null));
    in.add(option(SUPPORT, "이동 지원 요청", null, !setup.support(), null));
    out.add(
        new Question(
            "TRANSPORT_IN",
            "수련회장에 어떻게 가세요?",
            null,
            AnswerType.SINGLE_CHOICE,
            true,
            single(in, false),
            null));
    if (shuttle) {
      out.add(
          new Question(
              "SHUTTLE_IN",
              "가는 집회 차량은 언제 타세요?",
              "교회에서 수련회장으로 가는 차량입니다. 타는 날을 모두 골라주세요.",
              AnswerType.MULTI_CHOICE,
              true,
              multi(rounds(worshipDays, start, "집회 전")),
              when(ids, "TRANSPORT_IN", SHUTTLE)));
    }
    if (setup.car()) {
      ObjectNode offers = NODES.objectNode();
      offers.put("fieldId", ids.apply("CARPOOL_OFFER").toString());
      offers.put("equals", true);
      ObjectNode yesNo = NODES.objectNode();
      yesNo.put("style", "YES_NO");
      yesNo.putNull("yesLabel");
      yesNo.putNull("noLabel");
      out.add(
          new Question(
              "CARPOOL_OFFER",
              "동승자를 태울 수 있어요?",
              null,
              AnswerType.YES_NO,
              true,
              yesNo,
              when(ids, "TRANSPORT_IN", CAR)));
      ObjectNode seats = NODES.objectNode();
      seats.put("min", 1L);
      seats.put("max", 10L);
      seats.put("unit", "명");
      out.add(
          new Question(
              "CARPOOL_SEATS", "몇 명까지 태울 수 있어요?", null, AnswerType.NUMBER, true, seats, offers));
      out.add(
          new Question(
              "CARPOOL_AREA",
              "어느 동네에서 태울 수 있어요?",
              null,
              AnswerType.SHORT_TEXT,
              true,
              shortText(100),
              offers));
      out.add(
          new Question(
              "CARPOOL_NOTE",
              "경유할 수 있는 지역이나 전할 말이 있나요?",
              null,
              AnswerType.LONG_TEXT,
              false,
              longText(),
              offers));
    }
    if (setup.support()) {
      out.add(
          new Question(
              "MOBILITY_IN",
              "갈 때 어느 동네에서 타면 편해요?",
              SUPPORT_NOTICE,
              AnswerType.SHORT_TEXT,
              true,
              shortText(100),
              when(ids, "TRANSPORT_IN", SUPPORT)));
    }

    // A participant who drives there drives back, so the way back is asked of everyone else.
    if (setup.groupBus() || shuttle || setup.publicTransit() || setup.support()) {
      ArrayNode back = NODES.arrayNode();
      back.add(option(GROUP_BUS, "단체 이동 차량", null, !setup.groupBus(), forBus));
      back.add(option(SHUTTLE, "집회 차량", null, !shuttle, forShuttle));
      back.add(option(PUBLIC, "대중교통", null, !setup.publicTransit(), null));
      back.add(option(SUPPORT, "이동 지원 요청", null, !setup.support(), null));
      out.add(
          new Question(
              "TRANSPORT_OUT",
              "수련회장에서 어떻게 돌아가세요?",
              null,
              AnswerType.SINGLE_CHOICE,
              true,
              single(back, false),
              when(ids, "TRANSPORT_IN", GROUP_BUS, SHUTTLE, PUBLIC, SUPPORT)));
      if (shuttle) {
        out.add(
            new Question(
                "SHUTTLE_OUT",
                "오는 집회 차량은 언제 타세요?",
                "수련회장에서 교회로 돌아오는 차량입니다. 타는 날을 모두 골라주세요.",
                AnswerType.MULTI_CHOICE,
                true,
                multi(rounds(worshipDays, start, "집회 후")),
                when(ids, "TRANSPORT_OUT", SHUTTLE)));
      }
      if (setup.support()) {
        out.add(
            new Question(
                "MOBILITY_OUT",
                "올 때 어느 동네에서 내리면 편해요?",
                SUPPORT_NOTICE,
                AnswerType.SHORT_TEXT,
                true,
                shortText(100),
                when(ids, "TRANSPORT_OUT", SUPPORT)));
      }
    }
  }

  private static ArrayNode rounds(List<Integer> worshipDays, LocalDate start, String suffix) {
    ArrayNode out = NODES.arrayNode();
    for (int day : worshipDays) {
      out.add(
          option(
              "opt_d" + day, dayLabel(start.plusDays(day - 1L)) + " " + suffix, null, false, null));
    }
    return out;
  }

  /** Example: {@code 1월 22일 (금)}. */
  static String dayLabel(LocalDate date) {
    return date.getMonthValue()
        + "월 "
        + date.getDayOfMonth()
        + "일 ("
        + WEEKDAYS[date.getDayOfWeek().getValue() - 1]
        + ")";
  }

  private static JsonNode when(Function<String, UUID> ids, String targetKey, String... optionIds) {
    ObjectNode out = NODES.objectNode();
    out.put("fieldId", ids.apply(targetKey).toString());
    ArrayNode list = out.putArray("optionIds");
    for (String id : optionIds) {
      list.add(id);
    }
    return out;
  }

  private static ObjectNode option(
      String id, String label, String group, boolean hidden, JsonNode showWhen) {
    ObjectNode out = NODES.objectNode();
    out.put("optionId", id);
    out.put("label", label);
    if (group == null) {
      out.putNull("group");
    } else {
      out.put("group", group);
    }
    out.put("hidden", hidden);
    if (showWhen == null) {
      out.putNull("showWhen");
    } else {
      out.set("showWhen", showWhen.deepCopy());
    }
    return out;
  }

  private static ObjectNode single(ArrayNode options, boolean buttons) {
    ObjectNode out = NODES.objectNode();
    out.set("options", options);
    out.put("allowOther", false);
    out.put("display", buttons ? "BUTTONS" : "LIST");
    return out;
  }

  private static ObjectNode multi(ArrayNode options) {
    ObjectNode out = NODES.objectNode();
    out.set("options", options);
    out.put("allowOther", false);
    out.put("minSelect", 0);
    out.putNull("maxSelect");
    return out;
  }

  private static ObjectNode shortText(int maxLength) {
    ObjectNode out = NODES.objectNode();
    out.put("maxLength", maxLength);
    out.put("format", "NONE");
    out.putNull("placeholder");
    return out;
  }

  private static ObjectNode longText() {
    ObjectNode out = NODES.objectNode();
    out.put("maxLength", FieldRules.LONG_TEXT_DEFAULT);
    out.putNull("placeholder");
    return out;
  }

  private static ObjectNode dateTime(LocalDate start, LocalDate end) {
    ObjectNode out = NODES.objectNode();
    out.put("includeTime", true);
    out.put("min", start + "T00:00");
    out.put("max", end + "T23:59");
    return out;
  }
}
