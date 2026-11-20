package app.scene.event.home;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.web.RequestIdFilter;
import app.scene.support.ParticipantSessions;
import jakarta.servlet.http.Cookie;
import java.util.UUID;
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

/** Event, operator and participants for the participant home tests, inserted by SQL. */
final class ParticipantFeedFixture {

  static final String CSRF_COOKIE = "XSRF-TOKEN";
  static final String CSRF_HEADER = "X-XSRF-TOKEN";
  static final String CSRF = "csrf-token";

  final JdbcTemplate jdbc;
  final JsonMapper json;
  final MockMvc mvc;

  ParticipantFeedFixture(WebApplicationContext context, JdbcTemplate jdbc, JsonMapper json) {
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

  record Person(UUID id, String name, String phone, Cookie session) {}

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

    Person participant(String name, String phone) {
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
      return new Person(id, name, phone, ParticipantSessions.open(jdbc, spaceId, eventId, id));
    }

    void withdraw(Person person) {
      jdbc.update(
          "UPDATE applications SET status = 'WITHDRAWN' WHERE participant_id = ?", person.id());
    }

    String createGroup(String name) throws Exception {
      return json.readTree(
              mvc.perform(
                      write(post(path("/groups")), owner)
                          .content(json.writeValueAsString(java.util.Map.of("name", name))))
                  .andExpect(status().isCreated())
                  .andReturn()
                  .getResponse()
                  .getContentAsString())
          .get("group")
          .get("groupId")
          .asString();
    }

    void assign(UUID participantId, String from, String to) throws Exception {
      String change =
          "{\"participantId\":\""
              + participantId
              + "\",\"fromGroupId\":"
              + quoted(from)
              + ",\"toGroupId\":"
              + quoted(to)
              + "}";
      mvc.perform(
              write(post(path("/group-assignments")), owner)
                  .content("{\"changes\":[" + change + "]}"))
          .andExpect(status().isOk());
    }

    void leaders(String groupId, UUID... ids) throws Exception {
      long version = -1;
      for (JsonNode group : board().get("groups")) {
        if (group.get("groupId").asString().equals(groupId)) {
          version = group.get("version").asLong();
        }
      }
      StringBuilder list = new StringBuilder();
      for (UUID id : ids) {
        list.append(list.isEmpty() ? "" : ",").append('"').append(id).append('"');
      }
      mvc.perform(
              write(
                      org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(
                          path("/groups/" + groupId + "/leaders")),
                      owner)
                  .content(
                      "{\"expectedVersion\":" + version + ",\"participantIds\":[" + list + "]}"))
          .andExpect(status().isOk());
    }

    JsonNode board() throws Exception {
      return json.readTree(
          mvc.perform(get(path("/group-board")).cookie(owner))
              .andExpect(status().isOk())
              .andReturn()
              .getResponse()
              .getContentAsString());
    }

    /** Publishes the working copy and returns the result string. */
    String publish() throws Exception {
      long version = board().get("boardVersion").asLong();
      return json.readTree(
              mvc.perform(
                      write(post(path("/groups/publish")), owner)
                          .content(
                              "{\"expectedBoardVersion\":"
                                  + version
                                  + ",\"confirmUnassigned\":true}"))
                  .andReturn()
                  .getResponse()
                  .getContentAsString())
          .path("result")
          .asString();
    }

    String path(String suffix) {
      return "/api/v1/operator/events/" + eventId + suffix;
    }
  }

  World world(String eventType) throws Exception {
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
        "UPDATE events SET lifecycle_status = 'ACTIVE', event_type = ?, start_date = DATE"
            + " '2027-01-22', end_date = DATE '2027-01-24', place = '양평' WHERE id = ?",
        eventType,
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
    return json.readTree(
        mvc.perform(get(path).cookie(session))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString());
  }

  JsonNode updates(Person person) throws Exception {
    return read("/api/v1/participant/updates", person.session());
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

  private static String quoted(String value) {
    return value == null ? "null" : "\"" + value + "\"";
  }
}
