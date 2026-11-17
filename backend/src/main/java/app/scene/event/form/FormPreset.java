package app.scene.event.form;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HexFormat;
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
          // No longer generated. Kept so a question stored from the former newcomer switch keeps a
          // place until the next setup save removes or hides it.
          "NEWCOMER",
          "ATTENDANCE",
          "ARRIVAL_AT",
          "DEPARTURE_AT",
          "ARRIVAL_SLOT",
          "DEPARTURE_SLOT",
          "LODGING",
          "NO_LODGING",
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
  static final String RIDE = "opt_ride";
  static final String PUBLIC = "opt_public";
  static final String SUPPORT = "opt_support";

  /** The one option of {@code NO_LODGING}: the participant sleeps at home (DEC-074 Follow-up). */
  public static final String NO_LODGING = "opt_no_lodging";

  /**
   * The option that marks a newcomer in the middle group or cell question (DEC-070 Follow-up
   * 2026-11-17). A newcomer has no middle group or cell yet. The id stays when the operator rewords
   * it.
   */
  public static final String NEWCOMER = "opt_newcomer";

  static final String NEWCOMER_LABEL = "새가족 (등반X)";

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
    affiliation(out, setup, ids);

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
    List<String[]> slots = slots(setup, start, days);
    if (setup.partial() && setup.range()) {
      // DEC-074: the arrival and departure slots stand for every slot between them.
      if (!slots.isEmpty()) {
        ArrayNode from = NODES.arrayNode();
        ArrayNode to = NODES.arrayNode();
        for (String[] slot : slots) {
          from.add(option(slot[0], slot[1] + "부터", null, false, null));
          to.add(option(slot[0], slot[1] + "까지", null, false, null));
        }
        out.add(
            new Question(
                "ARRIVAL_SLOT",
                "수련회장에 언제 도착하나요?",
                "도착부터 출발까지의 식사와 프로그램에 모두 참석하는 것으로 신청됩니다.",
                AnswerType.SINGLE_CHOICE,
                true,
                single(from, false),
                whenPartial));
        out.add(
            new Question(
                "DEPARTURE_SLOT",
                "수련회장에서 언제 출발하나요?",
                null,
                AnswerType.SINGLE_CHOICE,
                true,
                single(to, false),
                whenPartial));
      }
    } else if (setup.partial()) {
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
          nights.add(option("opt_n" + night, nightLabel(night, date), null, false, null));
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
    if (setup.asksNoLodging(days)) {
      // A commuter is inside the range or attends in full but sleeps at home, so every night drops
      // them. Worship-only attendees sleep none already.
      ArrayNode stay = NODES.arrayNode();
      stay.add(option(NO_LODGING, "수련회장에서 숙박하지 않아요", null, false, null));
      out.add(
          new Question(
              "NO_LODGING",
              "숙박",
              "집에서 오가며 참석한다면 체크해 주세요.",
              AnswerType.MULTI_CHOICE,
              false,
              multi(stay),
              attendance ? when(ids, "ATTENDANCE", FULL, PARTIAL) : null));
    }
    if (attendance && !setup.range()) {
      ArrayNode cells = NODES.arrayNode();
      for (String[] slot : slots) {
        cells.add(option(slot[0], slot[3], slot[2], false, null));
      }
      if (!cells.isEmpty()) {
        out.add(
            new Question(
                "MEALS",
                "참석할 프로그램과 식사를 선택해주세요",
                "참석하는 일정에 포함되는 식사와 프로그램을 모두 선택해 주세요."
                    + " ※ 식사는 실제 식사 여부와 관계없이 참석 일정에 포함된 경우 신청 인원에 반영됩니다.",
                AnswerType.MULTI_CHOICE,
                true,
                multi(cells),
                when(ids, "ATTENDANCE", PARTIAL, WORSHIP)));
      }
    }
    if (setup.worshipOnly() && setup.range()) {
      // DEC-074: a worship-only attendee still picks services; meals stay listed but hidden so
      // option ids stay the same as in SLOTS mode.
      ArrayNode cells = NODES.arrayNode();
      boolean anyWorship = false;
      for (String[] slot : slots) {
        boolean worship = slot[0].endsWith("_worship");
        anyWorship |= worship;
        cells.add(option(slot[0], slot[3], slot[2], !worship, null));
      }
      if (anyWorship) {
        out.add(
            new Question(
                "MEALS",
                "참석할 집회를 선택해주세요",
                null,
                AnswerType.MULTI_CHOICE,
                true,
                multi(cells),
                when(ids, "ATTENDANCE", WORSHIP)));
      }
    }
    if (setup.partial()) {
      out.add(
          new Question(
              "PARTIAL_NOTE",
              "운영진이 알아야 할 부분 참석 메모가 있나요?",
              setup.range() ? "중간에 나갔다가 다시 오거나 수련회장에서 자지 않는다면 적어 주세요." : null,
              AnswerType.LONG_TEXT,
              false,
              longText(),
              whenPartial));
    }

    if (setup.anyTransport()) {
      transport(out, setup, start, days, attendance, slots, ids);
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

  /**
   * The middle group and cell questions. With a list on the setup card the question is a dropdown
   * of those names; otherwise it stays a short free answer. The first dropdown also gets {@link
   * #NEWCOMER}. When it is the middle group dropdown, the cell question is shown only to someone
   * who chose a listed middle group, since a newcomer has no cell.
   */
  private static void affiliation(List<Question> out, FormSetup setup, Function<String, UUID> ids) {
    boolean middleChoice = setup.middleGroup() && !setup.middleGroups().isEmpty();
    boolean cellChoice = setup.cell() && !setup.cells().isEmpty();
    List<String> middleIds = new ArrayList<>();
    if (middleChoice) {
      ArrayNode options = NODES.arrayNode();
      for (String name : setup.middleGroups()) {
        String id = listOptionId("mg", name);
        middleIds.add(id);
        options.add(option(id, name, null, false, null));
      }
      options.add(option(NEWCOMER, NEWCOMER_LABEL, null, false, null));
      out.add(
          new Question(
              "MIDDLE_GROUP",
              "중그룹",
              "소속 중그룹을 골라주세요. 아직 중그룹이 없는 새가족은 '" + NEWCOMER_LABEL + "'을 골라주세요.",
              AnswerType.DROPDOWN,
              true,
              dropdown(options),
              null));
    } else if (setup.middleGroup()) {
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
    if (!setup.cell()) {
      return;
    }
    JsonNode whenListed =
        middleChoice ? when(ids, "MIDDLE_GROUP", middleIds.toArray(String[]::new)) : null;
    if (cellChoice) {
      ArrayNode options = NODES.arrayNode();
      for (String name : setup.cells()) {
        options.add(option(listOptionId("cell", name), name, null, false, null));
      }
      String description = "소속 셀을 골라주세요.";
      if (!middleChoice) {
        options.add(option(NEWCOMER, NEWCOMER_LABEL, null, false, null));
        description += " 아직 셀이 없는 새가족은 '" + NEWCOMER_LABEL + "'을 골라주세요.";
      }
      out.add(
          new Question(
              "CELL", "셀", description, AnswerType.DROPDOWN, true, dropdown(options), whenListed));
    } else {
      out.add(
          new Question(
              "CELL",
              "셀",
              "소속 셀이 있으면 적어주세요.",
              AnswerType.SHORT_TEXT,
              false,
              shortText(50),
              whenListed));
    }
  }

  /**
   * A listed name's option id, computed from the name so the same name keeps its id across saves.
   * Renaming an entry on the setup card makes a new option.
   */
  static String listOptionId(String prefix, String name) {
    try {
      byte[] hash =
          MessageDigest.getInstance("SHA-256").digest(name.getBytes(StandardCharsets.UTF_8));
      return "opt_" + prefix + "_" + HexFormat.of().formatHex(hash, 0, 4);
    } catch (NoSuchAlgorithmException exception) {
      throw new IllegalStateException(exception);
    }
  }

  /**
   * Whether a participant is a newcomer (DEC-070 Follow-up 2026-11-17), the one place this is
   * decided. The middle group question decides when it offers {@link #NEWCOMER}, otherwise the cell
   * question. {@code null} when neither offers it or that question has no answer. Each config and
   * answer is the visible question's stored JSON, or null.
   */
  public static Boolean newcomer(
      JsonNode middleConfig, JsonNode middleAnswer, JsonNode cellConfig, JsonNode cellAnswer) {
    if (offersNewcomer(middleConfig)) {
      return chose(middleAnswer);
    }
    if (offersNewcomer(cellConfig)) {
      return chose(cellAnswer);
    }
    return null;
  }

  private static boolean offersNewcomer(JsonNode config) {
    if (config == null || !config.path("options").isArray()) {
      return false;
    }
    for (JsonNode option : config.get("options")) {
      JsonNode id = option.path("optionId");
      if (id.isString() && NEWCOMER.equals(id.asString())) {
        return true;
      }
    }
    return false;
  }

  private static Boolean chose(JsonNode answer) {
    JsonNode id = answer == null ? null : answer.get("optionId");
    if (id == null || !id.isString()) {
      return null;
    }
    return NEWCOMER.equals(id.asString());
  }

  private static void transport(
      List<Question> out,
      FormSetup setup,
      LocalDate start,
      int days,
      boolean attendance,
      List<String[]> slots,
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
    JsonNode busIn = forBus;
    JsonNode busOut = forBus;
    JsonNode shuttleIn = forShuttle;
    JsonNode shuttleOut = forShuttle;
    if (setup.partialByTime() && attendance && setup.partial() && !slots.isEmpty()) {
      // A partial attendee rides the church vehicle only when they come or leave with it: the
      // group bus at the first and last slot, the worship shuttle at a worship slot. In SLOTS mode
      // the first chosen slot cannot be told apart, so the shuttle stays as it was.
      String first = slots.get(0)[0];
      String last = slots.get(slots.size() - 1)[0];
      if (setup.range()) {
        List<String> worship = new ArrayList<>();
        for (String[] slot : slots) {
          if (slot[0].endsWith("_worship")) {
            worship.add(slot[0]);
          }
        }
        String[] worshipIds = worship.toArray(String[]::new);
        busIn = anyOf(when(ids, "ATTENDANCE", FULL), when(ids, "ARRIVAL_SLOT", first));
        busOut = anyOf(when(ids, "ATTENDANCE", FULL), when(ids, "DEPARTURE_SLOT", last));
        if (worshipIds.length > 0) {
          shuttleIn =
              anyOf(when(ids, "ATTENDANCE", WORSHIP), when(ids, "ARRIVAL_SLOT", worshipIds));
          shuttleOut =
              anyOf(when(ids, "ATTENDANCE", WORSHIP), when(ids, "DEPARTURE_SLOT", worshipIds));
        }
      } else {
        busIn = anyOf(when(ids, "ATTENDANCE", FULL), when(ids, "MEALS", first));
        busOut = anyOf(when(ids, "ATTENDANCE", FULL), when(ids, "MEALS", last));
      }
    }

    ArrayNode in = NODES.arrayNode();
    in.add(option(GROUP_BUS, "단체 이동 차량", null, !setup.groupBus(), busIn));
    in.add(option(SHUTTLE, "집회 차량", null, !shuttle, shuttleIn));
    in.add(option(CAR, "자차 (직접 운전)", null, !setup.car(), null));
    in.add(option(RIDE, "자차 합승 (다른 사람 차를 타요)", null, !setup.car(), null));
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

    // A participant who drives or rides a car there comes back the same way, so the way back is
    // asked of everyone else.
    if (setup.groupBus() || shuttle || setup.publicTransit() || setup.support()) {
      ArrayNode back = NODES.arrayNode();
      back.add(option(GROUP_BUS, "단체 이동 차량", null, !setup.groupBus(), busOut));
      back.add(option(SHUTTLE, "집회 차량", null, !shuttle, shuttleOut));
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

  /**
   * The setup's slots in {@link MealSlots} order: option id, {@code 1월 22일 (금) 저녁}, the day label,
   * and the meal wording.
   */
  private static List<String[]> slots(FormSetup setup, LocalDate start, int days) {
    List<String[]> out = new ArrayList<>();
    for (int day = 1; day <= days; day++) {
      FormSetup.Day slots = setup.schedule().get(day - 1);
      String group = dayLabel(start.plusDays(day - 1L));
      boolean[] on = {slots.breakfast(), slots.lunch(), slots.dinner(), slots.worship()};
      String[] keys = {"breakfast", "lunch", "dinner", "worship"};
      String[] words = {"아침", "점심", "저녁", "집회"};
      for (int kind = 0; kind < keys.length; kind++) {
        if (on[kind]) {
          out.add(
              new String[] {
                "opt_d" + day + "_" + keys[kind], group + " " + words[kind], group, words[kind]
              });
        }
      }
    }
    return out;
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

  /** Example: {@code 첫째 밤 (1월 22일 (금))}. {@code date} is the evening of that night. */
  public static String nightLabel(int night, LocalDate date) {
    return ORDINALS[night - 1] + " 밤 (" + dayLabel(date) + ")";
  }

  /** Example: {@code 1월 22일 (금)}. */
  public static String dayLabel(LocalDate date) {
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

  private static JsonNode anyOf(JsonNode... clauses) {
    ObjectNode out = NODES.objectNode();
    ArrayNode list = out.putArray("anyOf");
    for (JsonNode clause : clauses) {
      list.add(clause);
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

  private static ObjectNode dropdown(ArrayNode options) {
    ObjectNode out = NODES.objectNode();
    out.set("options", options);
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
