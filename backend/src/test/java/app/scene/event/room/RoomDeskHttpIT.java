package app.scene.event.room;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.web.RequestIdFilter;
import app.scene.event.checkin.CheckInCodes;
import app.scene.support.PostgresTestcontainer;
import jakarta.servlet.http.Cookie;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers;
import org.springframework.session.web.http.SessionRepositoryFilter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The published room on the 참가 현황 table, the CSV and the check-in roster and results (G5 #460,
 * DEC-085 §10). Covers the G5 part of api.md "숙소" 시험 조건 1 (working-copy saves change none of them;
 * publishing changes all of them) and the rows of api.md "참가 현황 표", "신청자 CSV" and "체크인" that G5
 * adds. The form is stored by SQL like {@link RoomHttpIT}: a SLOTS setup with two nights, so a full
 * attendee sleeps and a worship-only attendee does not.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class RoomDeskHttpIT {

  private static final String OPERATOR_COOKIE = "SCENE_SESSION";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";

  private static final String ATTENDANCE_OPTIONS =
      "{\"options\":[{\"optionId\":\"opt_full\",\"label\":\"전체\"},"
          + "{\"optionId\":\"opt_partial\",\"label\":\"부분\"},"
          + "{\"optionId\":\"opt_worship\",\"label\":\"집회만\"}]}";
  private static final String LODGING_OPTIONS =
      "{\"options\":[{\"optionId\":\"opt_n1\",\"label\":\"첫째 밤\"},"
          + "{\"optionId\":\"opt_n2\",\"label\":\"둘째 밤\"}]}";
  private static final String NO_LODGING_OPTIONS =
      "{\"options\":[{\"optionId\":\"opt_no_lodging\",\"label\":\"숙박 안 함\"}]}";
  private static final String FULL = "{\"optionId\":\"opt_full\"}";
  private static final String WORSHIP = "{\"optionId\":\"opt_worship\"}";

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;
  @Autowired CheckInCodes codes;

  MockMvc mvc;

  @BeforeEach
  void mockMvc() {
    mvc =
        MockMvcBuilders.webAppContextSetup(context)
            .addFilters(
                context.getBean(RequestIdFilter.class),
                context.getBean(SessionRepositoryFilter.class))
            .apply(SecurityMockMvcConfigurers.springSecurity())
            .build();
  }

  /**
   * 시험 조건 1 (G5 part): rooms of the working copy never reach the table, the CSV, the roster or a
   * check-in result; publishing shows them everywhere, and later working-copy moves and deletes do
   * not until the next publication.
   */
  @Test
  void onlyThePublishedRoomReachesTheTableCsvRosterAndCheckIn() throws Exception {
    World w = world();
    UUID lead = w.participant("가조장", "010-7000-0001", FULL);
    UUID mate = w.participant("나조원", "010-7000-0002", FULL);
    UUID late = w.participant("다늦게", "010-7000-0003", FULL);
    UUID home = w.participant("라집회", "010-7000-0004", WORSHIP);

    String r1 = createRoom(w, "301호", "본관 3층");
    assign(w, change(lead, null, r1), change(mate, null, r1));

    // Before the first publication: every room is blank, the lodging state is already there.
    JsonNode table = table(w);
    assertThat(table.get("roomPublishedAt").isNull()).isTrue();
    for (UUID p : List.of(lead, mate, late, home)) {
      assertThat(row(table, p).get("room").isNull()).isTrue();
    }
    assertThat(row(table, lead).get("lodging").asString()).isEqualTo("LODGING");
    assertThat(row(table, home).get("lodging").asString()).isEqualTo("NOT_LODGING");
    Map<String, String> csv = roomCells(w);
    assertThat(csv).containsEntry("가조장", "").containsEntry("라집회", "숙박 안 함");
    JsonNode roster = roster(w);
    assertThat(item(roster, lead).get("room").isNull()).isTrue();
    assertThat(item(roster, home).get("lodging").asString()).isEqualTo("NOT_LODGING");
    JsonNode before = json.readTree(ok(manual(w, lead, "k-lead")));
    assertThat(before.get("result").asString()).isEqualTo("CHECKED_IN");
    assertThat(before.get("room").isNull()).isTrue();
    assertThat(before.get("lodging").asString()).isEqualTo("LODGING");

    publish(w);

    table = table(w);
    assertThat(table.get("roomPublishedAt").isNull()).isFalse();
    JsonNode leadRoom = row(table, lead).get("room");
    assertThat(leadRoom.propertyNames()).containsExactly("roomId", "name");
    assertThat(leadRoom.get("roomId").asString()).isEqualTo(r1);
    assertThat(leadRoom.get("name").asString()).isEqualTo("301호");
    assertThat(row(table, mate).get("room").get("name").asString()).isEqualTo("301호");
    assertThat(row(table, late).get("room").isNull()).isTrue();
    assertThat(row(table, late).get("lodging").asString()).isEqualTo("LODGING");
    assertThat(row(table, home).get("room").isNull()).isTrue();
    csv = roomCells(w);
    assertThat(csv)
        .containsEntry("가조장", "301호")
        .containsEntry("나조원", "301호")
        .containsEntry("다늦게", "")
        .containsEntry("라집회", "숙박 안 함");
    roster = roster(w);
    JsonNode deskRoom = item(roster, lead).get("room");
    assertThat(deskRoom.propertyNames()).containsExactly("name", "locationNote");
    assertThat(deskRoom.toString()).isEqualTo("{\"name\":\"301호\",\"locationNote\":\"본관 3층\"}");
    assertThat(item(roster, late).get("room").isNull()).isTrue();

    // The check-in results: the same key replayed, a duplicate, and a QR scan carry the room.
    JsonNode replayed = json.readTree(ok(manual(w, lead, "k-lead")));
    assertThat(replayed.get("room").get("name").asString()).isEqualTo("301호");
    JsonNode duplicate = json.readTree(ok(manual(w, lead, "k-lead-2")));
    assertThat(duplicate.get("result").asString()).isEqualTo("ALREADY_CHECKED_IN");
    assertThat(duplicate.get("room").get("locationNote").asString()).isEqualTo("본관 3층");
    String code = codes.issue(w.eventId, mate).orElseThrow();
    JsonNode scanned =
        json.readTree(
            ok(
                write(
                        post(eventPath(w) + "/check-ins"),
                        w.owner,
                        json.writeValueAsString(Map.of("mode", "QR", "code", code)))
                    .header("Idempotency-Key", "q-mate")));
    assertThat(scanned.get("checkIn").get("method").asString()).isEqualTo("QR");
    assertThat(scanned.get("room").toString())
        .isEqualTo("{\"name\":\"301호\",\"locationNote\":\"본관 3층\"}");
    JsonNode homeCheckIn = json.readTree(ok(manual(w, home, "k-home")));
    assertThat(homeCheckIn.get("room").isNull()).isTrue();
    assertThat(homeCheckIn.get("lodging").asString()).isEqualTo("NOT_LODGING");

    // Working-copy moves and deletes stay on the board until the next publication.
    String r2 = createRoom(w, "302호", null);
    assign(w, change(mate, r1, r2), change(late, null, r2));
    ok(write(delete(eventPath(w) + "/rooms/" + r1 + "?expectedVersion=0"), w.owner, null));
    table = table(w);
    assertThat(row(table, lead).get("room").get("name").asString()).isEqualTo("301호");
    assertThat(row(table, mate).get("room").get("name").asString()).isEqualTo("301호");
    assertThat(row(table, late).get("room").isNull()).isTrue();
    assertThat(roomCells(w)).containsEntry("나조원", "301호").containsEntry("다늦게", "");
    assertThat(item(roster(w), mate).get("room").get("name").asString()).isEqualTo("301호");

    publish(w);
    table = table(w);
    assertThat(row(table, lead).get("room").isNull()).isTrue();
    assertThat(row(table, mate).get("room").get("name").asString()).isEqualTo("302호");
    assertThat(row(table, late).get("room").get("roomId").asString()).isEqualTo(r2);
    roster = roster(w);
    assertThat(item(roster, mate).get("room").toString())
        .isEqualTo("{\"name\":\"302호\",\"locationNote\":null}");
    assertThat(roomCells(w))
        .containsEntry("가조장", "")
        .containsEntry("나조원", "302호")
        .containsEntry("다늦게", "302호");
  }

  /**
   * The room is not a gated value: a STAFF operator who reads the table and the roster with {@code
   * EVENT_READ} sees it, like the published room the participants see. The withdrawn list has no
   * room.
   */
  @Test
  void everyTableAndRosterReaderSeesThePublishedRoom() throws Exception {
    World w = world();
    UUID p = w.participant("가나다", "010-7100-0001", FULL);
    String r1 = createRoom(w, "A동 101", "A동 1층 왼쪽");
    assign(w, change(p, null, r1));
    publish(w);

    Cookie staff = login(w.operator("Staff", "STAFF"));
    JsonNode table = json.readTree(ok(get(eventPath(w) + "/applications/table").cookie(staff)));
    assertThat(row(table, p).get("room").get("name").asString()).isEqualTo("A동 101");
    assertThat(table.get("withdrawn").isEmpty()).isTrue();
    JsonNode roster = json.readTree(ok(get(eventPath(w) + "/check-in-roster").cookie(staff)));
    assertThat(item(roster, p).get("room").get("locationNote").asString()).isEqualTo("A동 1층 왼쪽");
  }

  // ---- reads ----

  private JsonNode table(World w) throws Exception {
    return json.readTree(ok(get(eventPath(w) + "/applications/table").cookie(w.owner)));
  }

  private JsonNode roster(World w) throws Exception {
    return json.readTree(
        ok(get(eventPath(w) + "/check-in-roster").param("size", "100").cookie(w.owner)));
  }

  private static JsonNode row(JsonNode table, UUID participantId) {
    for (JsonNode row : table.get("rows")) {
      if (row.get("participantId").asString().equals(participantId.toString())) {
        return row;
      }
    }
    throw new AssertionError("not on the table: " + participantId);
  }

  private static JsonNode item(JsonNode roster, UUID participantId) {
    for (JsonNode item : roster.get("items")) {
      if (item.get("participantId").asString().equals(participantId.toString())) {
        return item;
      }
    }
    throw new AssertionError("not on the roster: " + participantId);
  }

  /** The CSV's last column by the 이름 column. The fixture's cells hold no comma or quote. */
  private Map<String, String> roomCells(World w) throws Exception {
    byte[] bytes =
        mvc.perform(
                post(eventPath(w) + "/applications/export")
                    .cookie(w.owner, csrf())
                    .header(CSRF_HEADER, CSRF))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsByteArray();
    String text = new String(bytes, 3, bytes.length - 3, StandardCharsets.UTF_8);
    List<List<String>> lines = new ArrayList<>();
    for (String line : text.split("\r\n")) {
      lines.add(Arrays.asList(line.split(",", -1)));
    }
    List<String> header = lines.get(0);
    assertThat(header.get(header.size() - 1)).isEqualTo("방");
    int name = header.indexOf("이름");
    Map<String, String> out = new LinkedHashMap<>();
    for (List<String> line : lines.subList(1, lines.size())) {
      assertThat(line).hasSameSizeAs(header);
      out.put(line.get(name), line.get(line.size() - 1));
    }
    return out;
  }

  // ---- writes ----

  private String createRoom(World w, String name, String note) throws Exception {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("name", name);
    body.put("locationNote", note);
    body.put("capacity", null);
    body.put("genderOptionId", null);
    return json.readTree(
            created(write(post(eventPath(w) + "/rooms"), w.owner, json.writeValueAsString(body))))
        .get("room")
        .get("roomId")
        .asString();
  }

  private void assign(World w, String... changes) throws Exception {
    ok(
        write(
            post(eventPath(w) + "/room-assignments"),
            w.owner,
            "{\"changes\":[" + String.join(",", changes) + "]}"));
  }

  private static String change(UUID participantId, String from, String to) {
    return "{\"participantId\":\""
        + participantId
        + "\",\"fromRoomId\":"
        + (from == null ? "null" : "\"" + from + "\"")
        + ",\"toRoomId\":"
        + (to == null ? "null" : "\"" + to + "\"")
        + "}";
  }

  private void publish(World w) throws Exception {
    long version =
        json.readTree(ok(get(eventPath(w) + "/room-board").cookie(w.owner)))
            .get("boardVersion")
            .asLong();
    JsonNode published =
        json.readTree(
            ok(
                write(
                    post(eventPath(w) + "/rooms/publish"),
                    w.owner,
                    "{\"expectedBoardVersion\":"
                        + version
                        + ",\"confirmUnassigned\":true,\"confirmNotLodging\":true,"
                        + "\"notify\":false}")));
    assertThat(published.get("result").asString()).isEqualTo("PUBLISHED");
  }

  private MockHttpServletRequestBuilder manual(World w, UUID participantId, String key) {
    return write(
            post(eventPath(w) + "/check-ins"),
            w.owner,
            "{\"mode\":\"MANUAL\",\"participantId\":\"" + participantId + "\"}")
        .header("Idempotency-Key", key);
  }

  private static MockHttpServletRequestBuilder write(
      MockHttpServletRequestBuilder request, Cookie session, String body) {
    request.cookie(session, csrf()).header(CSRF_HEADER, CSRF);
    if (body != null) {
      request.contentType(MediaType.APPLICATION_JSON).content(body);
    }
    return request;
  }

  private String ok(MockHttpServletRequestBuilder request) throws Exception {
    return mvc.perform(request)
        .andExpect(status().isOk())
        .andReturn()
        .getResponse()
        .getContentAsString(StandardCharsets.UTF_8);
  }

  private String created(MockHttpServletRequestBuilder request) throws Exception {
    return mvc.perform(request)
        .andExpect(status().isCreated())
        .andReturn()
        .getResponse()
        .getContentAsString(StandardCharsets.UTF_8);
  }

  // ---- fixtures ----

  private Cookie login(UUID userId) throws Exception {
    Cookie cookie =
        mvc.perform(
                post("/api/v1/operator/auth/login")
                    .cookie(csrf())
                    .header(CSRF_HEADER, CSRF)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"userId\":\"" + userId + "\"}"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getCookie(OPERATOR_COOKIE);
    assertThat(cookie).isNotNull();
    return cookie;
  }

  private static Cookie csrf() {
    return new Cookie(CSRF_COOKIE, CSRF);
  }

  private UUID user(String name) {
    UUID id = UUID.randomUUID();
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, ?)", id, name);
    return id;
  }

  private static String eventPath(World w) {
    return "/api/v1/operator/events/" + w.eventId;
  }

  /**
   * A space with an ACTIVE event, a SLOTS setup with two nights, a SYSTEM 이름 question and the
   * ATTENDANCE, LODGING and NO_LODGING questions.
   */
  private World world() throws Exception {
    UUID spaceId = UUID.randomUUID();
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, 'Home')", spaceId);
    UUID ownerId = user("Owner");
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, 'OWNER')", spaceId, ownerId);
    Cookie owner = login(ownerId);
    String created =
        created(
            write(
                post("/api/v1/operator/spaces/" + spaceId + "/events"),
                owner,
                "{\"name\":\"수련회\"}"));
    UUID eventId = UUID.fromString(json.readTree(created).get("eventId").asString());
    jdbc.update("UPDATE events SET lifecycle_status = 'ACTIVE' WHERE id = ?", eventId);
    UUID formId =
        jdbc.queryForList("SELECT id FROM forms WHERE event_id = ?", UUID.class, eventId).stream()
            .findFirst()
            .orElse(null);
    if (formId == null) {
      formId = UUID.randomUUID();
      jdbc.update(
          "INSERT INTO forms (id, space_id, event_id) VALUES (?, ?, ?)", formId, spaceId, eventId);
    }
    jdbc.update(
        "UPDATE forms SET setup = ?::jsonb WHERE id = ?",
        "{\"generatedFor\":{\"startDate\":\"2027-01-22\",\"endDate\":\"2027-01-24\"},"
            + "\"attendance\":{\"partial\":true,\"worshipOnly\":true,\"mode\":\"SLOTS\"}}",
        formId);
    World w = new World(spaceId, eventId, formId, owner);
    w.nameField = w.systemField("NAME", "이름");
    w.attendanceField = w.preset("ATTENDANCE", "SINGLE_CHOICE", ATTENDANCE_OPTIONS);
    w.preset("LODGING", "MULTI_CHOICE", LODGING_OPTIONS);
    w.preset("NO_LODGING", "MULTI_CHOICE", NO_LODGING_OPTIONS);
    return w;
  }

  private final class World {
    final UUID spaceId;
    final UUID eventId;
    final UUID formId;
    final Cookie owner;
    UUID nameField;
    UUID attendanceField;
    int submitted;

    World(UUID spaceId, UUID eventId, UUID formId, Cookie owner) {
      this.spaceId = spaceId;
      this.eventId = eventId;
      this.formId = formId;
      this.owner = owner;
    }

    UUID operator(String name, String role) {
      UUID id = user(name);
      jdbc.update(
          "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, 'MEMBER')", spaceId, id);
      jdbc.update(
          "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, ?)",
          spaceId,
          eventId,
          id,
          role);
      return id;
    }

    /** The form's SYSTEM question with this key, made when the event did not make one. */
    UUID systemField(String key, String label) {
      UUID existing =
          jdbc
              .queryForList(
                  "SELECT id FROM fields WHERE form_id = ? AND system_key = ?",
                  UUID.class,
                  formId,
                  key)
              .stream()
              .findFirst()
              .orElse(null);
      if (existing != null) {
        return existing;
      }
      UUID id = UUID.randomUUID();
      jdbc.update(
          """
          INSERT INTO fields (
            id, space_id, event_id, form_id, kind, system_key, label, position, required)
          VALUES (?, ?, ?, ?, 'SYSTEM', ?, ?,
            (SELECT coalesce(max(position), -1) + 1 FROM fields WHERE form_id = ?), true)
          """,
          id,
          spaceId,
          eventId,
          formId,
          key,
          label,
          formId);
      return id;
    }

    UUID preset(String key, String type, String config) {
      UUID id = UUID.randomUUID();
      jdbc.update(
          """
          INSERT INTO fields (
            id, space_id, event_id, form_id, kind, label, position, answer_type, required,
            config, preset_key, preset_state)
          VALUES (?, ?, ?, ?, 'CUSTOM', ?,
            (SELECT coalesce(max(position), -1) + 1 FROM fields WHERE form_id = ?),
            ?, false, ?::jsonb, ?, '{"active": true}'::jsonb)
          """,
          id,
          spaceId,
          eventId,
          formId,
          key,
          formId,
          type,
          config,
          key);
      return id;
    }

    void answer(UUID applicationId, UUID fieldId, String value) {
      jdbc.update(
          """
          INSERT INTO answers (id, space_id, event_id, application_id, field_id, value)
          VALUES (?, ?, ?, ?, ?, ?::jsonb)
          """,
          UUID.randomUUID(),
          spaceId,
          eventId,
          applicationId,
          fieldId,
          value);
    }

    /** A participant with one SUBMITTED application, the 이름 answer and the ATTENDANCE answer. */
    UUID participant(String name, String phone, String attendance) {
      UUID id = UUID.randomUUID();
      String digits = phone.replaceAll("[^0-9]", "");
      jdbc.update(
          """
          INSERT INTO participants (
            id, space_id, event_id, name, phone, phone_hash, phone_last4, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, now(), now())
          """,
          id,
          spaceId,
          eventId,
          name,
          phone,
          "h".repeat(64),
          digits.substring(digits.length() - 4));
      UUID applicationId = UUID.randomUUID();
      jdbc.update(
          """
          INSERT INTO applications (
            id, space_id, event_id, form_id, status, submitted_at, participant_id)
          VALUES (?, ?, ?, ?, 'SUBMITTED', now() + make_interval(secs => ?), ?)
          """,
          applicationId,
          spaceId,
          eventId,
          formId,
          submitted++,
          id);
      answer(applicationId, nameField, "{\"text\":\"" + name + "\"}");
      answer(applicationId, attendanceField, attendance);
      return id;
    }
  }
}
