package app.scene.event.notice;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Event, operators, participants and group publication for the notice tests, mostly by SQL. */
final class NoticeFixture {

  static final String CSRF = "csrf-token";
  static final String PARTICIPANT_NOTICES = "/api/v1/participant/notices";

  final JdbcTemplate jdbc;
  final JsonMapper json;
  final MockMvc mvc;

  NoticeFixture(WebApplicationContext context, JdbcTemplate jdbc, JsonMapper json) {
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

  record Operator(UUID id, Cookie session) {}

  final class World {
    final UUID spaceId;
    final UUID eventId;
    final UUID formId;
    final Operator owner;

    World(UUID spaceId, UUID eventId, UUID formId, Operator owner) {
      this.spaceId = spaceId;
      this.eventId = eventId;
      this.formId = formId;
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
      return new Person(id, ParticipantSessions.open(jdbc, spaceId, eventId, id));
    }

    void withdraw(Person person) {
      jdbc.update(
          "UPDATE applications SET status = 'WITHDRAWN' WHERE participant_id = ?", person.id());
    }

    /** A space member operating the event with {@code role}. */
    Operator operator(String role) throws Exception {
      UUID id = UUID.randomUUID();
      jdbc.update("INSERT INTO users (id, display_name) VALUES (?, ?)", id, role + " 운영자");
      jdbc.update(
          "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, 'MEMBER')", spaceId, id);
      jdbc.update(
          "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, ?)",
          spaceId,
          eventId,
          id,
          role);
      return new Operator(id, login(id));
    }

    void removeOperator(Operator operator) throws Exception {
      mvc.perform(
              write(
                  org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete(
                      path("/operators/" + operator.id())),
                  owner.session()))
          .andExpect(status().is2xxSuccessful());
    }

    /** One group with {@code leader} as its leader and the others as members, then publish. */
    void publishGroup(Person leader, Person... members) throws Exception {
      String groupId =
          json.readTree(
                  mvc.perform(
                          write(post(path("/groups")), owner.session())
                              .content("{\"name\":\"" + UUID.randomUUID() + "\"}"))
                      .andExpect(status().isCreated())
                      .andReturn()
                      .getResponse()
                      .getContentAsString())
              .get("group")
              .get("groupId")
              .asString();
      assign(leader.id(), null, groupId);
      for (Person member : members) {
        assign(member.id(), null, groupId);
      }
      setLeader(groupId, leader.id());
      publishGroups();
    }

    void assign(UUID participantId, String from, String to) throws Exception {
      String change =
          "{\"participantId\":\""
              + participantId
              + "\",\"fromGroupId\":"
              + (from == null ? "null" : "\"" + from + "\"")
              + ",\"toGroupId\":"
              + (to == null ? "null" : "\"" + to + "\"")
              + "}";
      mvc.perform(
              write(post(path("/group-assignments")), owner.session())
                  .content("{\"changes\":[" + change + "]}"))
          .andExpect(status().isOk());
    }

    void setLeader(String groupId, UUID... ids) throws Exception {
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
              write(put(path("/groups/" + groupId + "/leaders")), owner.session())
                  .content(
                      "{\"expectedVersion\":" + version + ",\"participantIds\":[" + list + "]}"))
          .andExpect(status().isOk());
    }

    String firstGroupId() throws Exception {
      return board().get("groups").get(0).get("groupId").asString();
    }

    JsonNode board() throws Exception {
      return read(path("/group-board"), owner.session());
    }

    void publishGroups() throws Exception {
      long version = board().get("boardVersion").asLong();
      mvc.perform(
              write(post(path("/groups/publish")), owner.session())
                  .content("{\"expectedBoardVersion\":" + version + ",\"confirmUnassigned\":true}"))
          .andExpect(status().isOk());
    }

    String path(String suffix) {
      return "/api/v1/operator/events/" + eventId + suffix;
    }

    String notices(String suffix) {
      return path("/notices" + suffix);
    }

    /** POST a notice; returns the response body. */
    JsonNode create(Operator by, String title, String audience, boolean publish, String extra)
        throws Exception {
      String body =
          "{\"title\":\""
              + title
              + "\",\"body\":\"본문 "
              + title
              + "\\n둘째 줄\",\"audience\":[{\"type\":\""
              + audience
              + "\"}],\"publish\":"
              + publish
              + (extra == null ? "" : "," + extra)
              + "}";
      return json.readTree(
          mvc.perform(write(post(notices("")), by.session()).content(body))
              .andExpect(status().isCreated())
              .andReturn()
              .getResponse()
              .getContentAsString());
    }

    ResultActions command(Operator by, String noticeId, String command, int version)
        throws Exception {
      return mvc.perform(
          write(post(notices("/" + noticeId + "/" + command)), by.session())
              .content("{\"expectedVersion\":" + version + "}"));
    }

    ResultActions patch(Operator by, String noticeId, String body) throws Exception {
      return mvc.perform(
          write(
                  org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(
                      notices("/" + noticeId)),
                  by.session())
              .content(body));
    }

    long participantNotices() {
      Long value =
          jdbc.query(
              "SELECT notices FROM participant_feed_versions WHERE event_id = ?",
              rs -> rs.next() ? rs.getLong(1) : 0L,
              eventId);
      return value == null ? 0 : value;
    }

    long boardVersion() {
      Long value =
          jdbc.query(
              "SELECT version FROM notice_boards WHERE event_id = ?",
              rs -> rs.next() ? rs.getLong(1) : 0L,
              eventId);
      return value == null ? 0 : value;
    }

    int notificationsFor(UUID participantId, String kind) {
      return jdbc.queryForObject(
          "SELECT count(*) FROM notifications WHERE recipient_participant_id = ? AND kind = ?",
          Integer.class,
          participantId,
          kind);
    }

    int operatorNotifications(UUID userId, String kind) {
      return jdbc.queryForObject(
          "SELECT count(*) FROM notifications WHERE event_id = ? AND recipient_user_id = ?"
              + " AND kind = ?",
          Integer.class,
          eventId,
          userId,
          kind);
    }

    void setEventStatus(String status) {
      jdbc.update("UPDATE events SET lifecycle_status = ? WHERE id = ?", status, eventId);
    }
  }

  World world() throws Exception {
    UUID spaceId = UUID.randomUUID();
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, 'Home')", spaceId);
    UUID ownerId = UUID.randomUUID();
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, '소유자')", ownerId);
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
        "UPDATE events SET lifecycle_status = 'ACTIVE', event_type = 'RETREAT' WHERE id = ?",
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
    return new World(spaceId, eventId, formId, new Operator(ownerId, owner));
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

  JsonNode list(Person person) throws Exception {
    return read(PARTICIPANT_NOTICES, person.session());
  }

  static MockHttpServletRequestBuilder write(
      MockHttpServletRequestBuilder request, Cookie session) {
    Cookie csrf = new Cookie("XSRF-TOKEN", CSRF);
    if (session == null) {
      request.cookie(csrf);
    } else {
      request.cookie(session, csrf);
    }
    return request.header("X-XSRF-TOKEN", CSRF).contentType(MediaType.APPLICATION_JSON);
  }
}
