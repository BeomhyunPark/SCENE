package app.scene.event.schedule;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.web.RequestIdFilter;
import app.scene.support.ParticipantSessions;
import jakarta.servlet.http.Cookie;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers;
import org.springframework.session.web.http.SessionRepositoryFilter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Event, operators and participants for the schedule tests, inserted by SQL and HTTP. */
final class ScheduleFixture {

  static final String CSRF_COOKIE = "XSRF-TOKEN";
  static final String CSRF_HEADER = "X-XSRF-TOKEN";
  static final String CSRF = "csrf-token";

  final JdbcTemplate jdbc;
  final JsonMapper json;
  final MockMvc mvc;

  ScheduleFixture(WebApplicationContext context, JdbcTemplate jdbc, JsonMapper json) {
    this.jdbc = jdbc;
    this.json = json;
    this.mvc =
        MockMvcBuilders.webAppContextSetup(context)
            .addFilters(
                context.getBean(RequestIdFilter.class),
                context.getBean(SessionRepositoryFilter.class))
            .apply(SecurityMockMvcConfigurers.springSecurity())
            .build();
  }

  record Person(UUID id, Cookie session) {}

  final class World {
    final UUID spaceId;
    final UUID eventId;
    final UUID formId;
    final UUID ownerId;
    final Cookie owner;

    World(UUID spaceId, UUID eventId, UUID formId, UUID ownerId, Cookie owner) {
      this.spaceId = spaceId;
      this.eventId = eventId;
      this.formId = formId;
      this.ownerId = ownerId;
      this.owner = owner;
    }

    String path(String suffix) {
      return "/api/v1/operator/events/" + eventId + suffix;
    }

    Person participant(String name) {
      UUID id = UUID.randomUUID();
      jdbc.update(
          """
          INSERT INTO participants (
            id, space_id, event_id, name, phone, phone_hash, phone_last4, created_at, updated_at)
          VALUES (?, ?, ?, ?, '010-0000-0000', ?, '0000', now(), now())
          """,
          id,
          spaceId,
          eventId,
          name,
          "h".repeat(64));
      jdbc.update(
          """
          INSERT INTO applications (
            id, space_id, event_id, form_id, status, submitted_at, participant_id)
          VALUES (?, ?, ?, ?, 'SUBMITTED', now(), ?)
          """,
          UUID.randomUUID(),
          spaceId,
          eventId,
          formId,
          id);
      return new Person(id, ParticipantSessions.open(jdbc, spaceId, eventId, id));
    }

    void withdraw(Person person) {
      jdbc.update(
          "UPDATE applications SET status = 'WITHDRAWN' WHERE participant_id = ?", person.id());
    }

    /** A new operator of this event with {@code role}; returns the session cookie. */
    Cookie operator(String role) throws Exception {
      UUID userId = UUID.randomUUID();
      jdbc.update("INSERT INTO users (id, display_name) VALUES (?, ?)", userId, role);
      jdbc.update(
          "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, 'MEMBER')", spaceId, userId);
      jdbc.update(
          "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, ?)",
          spaceId,
          eventId,
          userId,
          role);
      return login(userId);
    }

    void lifecycle(String lifecycle) {
      jdbc.update("UPDATE events SET lifecycle_status = ? WHERE id = ?", lifecycle, eventId);
    }

    // -------------------------------------------------------------- schedule

    JsonNode board() throws Exception {
      return read(path("/schedule"), owner);
    }

    long boardVersion() throws Exception {
      return board().get("boardVersion").asLong();
    }

    ResultActions createRaw(Cookie who, Map<String, Object> body) throws Exception {
      return mvc.perform(write(post(path("/schedule/items")), who).content(json(body)));
    }

    /** Creates an item and returns the response {@code item}. */
    JsonNode create(Map<String, Object> body) throws Exception {
      return body(createRaw(owner, body).andExpect(status().isCreated())).get("item");
    }

    JsonNode create(int day, String start, String title, String audience) throws Exception {
      return create(item(day, start, title, audience));
    }

    ResultActions patchRaw(Cookie who, String itemId, Map<String, Object> body) throws Exception {
      return mvc.perform(
          write(
                  org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(
                      path("/schedule/items/" + itemId)),
                  who)
              .content(json(body)));
    }

    JsonNode update(String itemId, Map<String, Object> body) throws Exception {
      return body(patchRaw(owner, itemId, body).andExpect(status().isOk()));
    }

    ResultActions deleteRaw(String itemId, String query) throws Exception {
      return mvc.perform(write(delete(path("/schedule/items/" + itemId + "?" + query)), owner));
    }

    ResultActions publishRaw(Cookie who, Map<String, Object> body) throws Exception {
      return mvc.perform(write(post(path("/schedule/publish")), who).content(json(body)));
    }

    JsonNode publish() throws Exception {
      return publish(true);
    }

    JsonNode publish(boolean notify) throws Exception {
      return body(
          publishRaw(owner, Map.of("expectedBoardVersion", boardVersion(), "notify", notify))
              .andExpect(status().isOk()));
    }

    JsonNode schedule(Person person) throws Exception {
      return read("/api/v1/participant/schedule", person.session());
    }

    long feed() {
      Long value =
          jdbc.queryForObject(
              "SELECT coalesce((SELECT schedule FROM participant_feed_versions"
                  + " WHERE event_id = ?), 0)",
              Long.class,
              eventId);
      return value == null ? 0 : value;
    }

    int count(String sql) {
      Integer value = jdbc.queryForObject(sql, Integer.class, eventId);
      return value == null ? 0 : value;
    }

    int notificationsOf(Person person) {
      Integer value =
          jdbc.queryForObject(
              "SELECT count(*) FROM notifications WHERE recipient_participant_id = ?",
              Integer.class,
              person.id());
      return value == null ? 0 : value;
    }

    // -------------------------------------------------------------- groups

    String createGroup(String name) throws Exception {
      return body(mvc.perform(
                  write(post(path("/groups")), owner).content(json(Map.of("name", name))))
              .andExpect(status().isCreated()))
          .get("group")
          .get("groupId")
          .asString();
    }

    void assign(UUID participantId, String to) throws Exception {
      mvc.perform(
              write(post(path("/group-assignments")), owner)
                  .content(
                      "{\"changes\":[{\"participantId\":\""
                          + participantId
                          + "\",\"fromGroupId\":null,\"toGroupId\":\""
                          + to
                          + "\"}]}"))
          .andExpect(status().isOk());
    }

    void leaders(String groupId, UUID... ids) throws Exception {
      long version = -1;
      for (JsonNode group : read(path("/group-board"), owner).get("groups")) {
        if (group.get("groupId").asString().equals(groupId)) {
          version = group.get("version").asLong();
        }
      }
      StringBuilder list = new StringBuilder();
      for (UUID id : ids) {
        list.append(list.isEmpty() ? "" : ",").append('"').append(id).append('"');
      }
      mvc.perform(
              write(put(path("/groups/" + groupId + "/leaders")), owner)
                  .content(
                      "{\"expectedVersion\":" + version + ",\"participantIds\":[" + list + "]}"))
          .andExpect(status().isOk());
    }

    void publishGroups() throws Exception {
      long version = read(path("/group-board"), owner).get("boardVersion").asLong();
      mvc.perform(
              write(post(path("/groups/publish")), owner)
                  .content("{\"expectedBoardVersion\":" + version + ",\"confirmUnassigned\":true}"))
          .andExpect(status().isOk());
    }
  }

  static Map<String, Object> item(int day, String start, String title, String audience) {
    return new java.util.LinkedHashMap<>(
        Map.of(
            "day",
            day,
            "startTime",
            start,
            "title",
            title,
            "category",
            "PROGRAM",
            "audience",
            java.util.List.of(Map.of("type", audience))));
  }

  World world() throws Exception {
    UUID spaceId = UUID.randomUUID();
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, 'Home')", spaceId);
    UUID ownerId = UUID.randomUUID();
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, 'Owner')", ownerId);
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, 'OWNER')", spaceId, ownerId);
    Cookie owner = login(ownerId);
    String created =
        mvc.perform(
                write(post("/api/v1/operator/spaces/" + spaceId + "/events"), owner)
                    .content("{\"name\":\"수련회\"}"))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    UUID eventId = UUID.fromString(json.readTree(created).get("eventId").asString());
    jdbc.update(
        "UPDATE events SET lifecycle_status = 'ACTIVE', event_type = 'RETREAT', start_date = DATE"
            + " '2027-01-22', end_date = DATE '2027-01-24' WHERE id = ?",
        eventId);
    UUID formId =
        jdbc.queryForList("SELECT id FROM forms WHERE event_id = ?", UUID.class, eventId).stream()
            .findFirst()
            .orElse(null);
    if (formId == null) {
      formId = UUID.randomUUID();
      jdbc.update(
          "INSERT INTO forms (id, space_id, event_id) VALUES (?, ?, ?)", formId, spaceId, eventId);
    }
    return new World(spaceId, eventId, formId, ownerId, owner);
  }

  Cookie login(UUID userId) throws Exception {
    Cookie cookie =
        mvc.perform(
                write(post("/api/v1/operator/auth/login"), null)
                    .content("{\"userId\":\"" + userId + "\"}"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getCookie("SCENE_SESSION");
    assertThat(cookie).isNotNull();
    return cookie;
  }

  JsonNode read(String path, Cookie session) throws Exception {
    return body(mvc.perform(get(path).cookie(session)).andExpect(status().isOk()));
  }

  JsonNode body(ResultActions actions) throws Exception {
    return json.readTree(actions.andReturn().getResponse().getContentAsString());
  }

  String json(Object value) {
    return json.writeValueAsString(value);
  }

  static MockHttpServletRequestBuilder write(
      MockHttpServletRequestBuilder request, Cookie session) {
    Cookie csrf = new Cookie(CSRF_COOKIE, CSRF);
    if (session == null) {
      request.cookie(csrf);
    } else {
      request.cookie(session, csrf);
    }
    return request.header(CSRF_HEADER, CSRF).contentType(MediaType.APPLICATION_JSON);
  }
}
