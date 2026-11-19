package app.scene.event;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.ratelimit.InMemoryRateLimiter;
import app.scene.common.web.RequestIdFilter;
import app.scene.event.invitation.CapturingInvitationMailer;
import app.scene.event.invitation.InvitationMail;
import app.scene.support.PostgresTestcontainer;
import jakarta.servlet.http.Cookie;
import java.util.ArrayList;
import java.util.List;
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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * #387. {@code GET /api/v1/operator/events} lists the events the caller operates in any space,
 * without an active space membership. The leave → event invitation → accept journey runs through
 * the real HTTP routes for both leave choices.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class OperatedEventListHttpIT {

  private static final String PATH = "/api/v1/operator/events";
  private static final String OPERATOR_COOKIE = "SCENE_SESSION";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";
  private static final String LINK_PREFIX = "/operator/invitations#";

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;
  @Autowired CapturingInvitationMailer mailer;
  @Autowired InMemoryRateLimiter attempts;

  MockMvc mvc;

  @BeforeEach
  void mockMvc() {
    mailer.clear();
    attempts.clear();
    mvc =
        MockMvcBuilders.webAppContextSetup(context)
            .addFilters(
                context.getBean(RequestIdFilter.class),
                context.getBean(SessionRepositoryFilter.class))
            .apply(SecurityMockMvcConfigurers.springSecurity())
            .build();
  }

  @Test
  void anonymousIsUnauthorizedAndSortIsRejected() throws Exception {
    mvc.perform(get(PATH).header("X-Request-Id", "req-anon"))
        .andExpect(status().isUnauthorized())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));

    Cookie session = login(user("Caller"), null);
    mvc.perform(get(PATH + "?sort=name,asc").cookie(session))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
        .andExpect(jsonPath("$.errors[0].field").value("sort"));
    mvc.perform(get(PATH + "?size=101").cookie(session))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("PAGE_SIZE_EXCEEDED"));
  }

  @Test
  void nobodyGetsAnEmptyPage() throws Exception {
    JsonNode body = list(login(user("Nobody"), null));
    assertThat(body.propertyNames()).containsExactly("items", "page");
    assertThat(body.get("items")).isEmpty();
    assertThat(body.get("page").get("totalItems").asInt()).isZero();
  }

  /** DEC-039 collaborator: no membership, only an event_users row. */
  @Test
  void pureCollaboratorSeesOnlyTheirEventWithTheSpaceName() throws Exception {
    UUID owner = user("Owner");
    UUID space = space("Grace Church");
    member(space, owner, "OWNER");
    UUID retreat = event(space, "Winter retreat");
    UUID other = event(space, "Other event");
    operator(space, retreat, owner, "OWNER");
    operator(space, other, owner, "OWNER");
    UUID collaborator = user("Helper");
    operator(space, retreat, collaborator, "STAFF");

    JsonNode body = list(login(collaborator, null));
    assertThat(body.get("page").get("totalItems").asInt()).isEqualTo(1);
    JsonNode item = body.get("items").get(0);
    assertThat(item.propertyNames())
        .containsExactly(
            "eventId",
            "name",
            "lifecycleStatus",
            "startDate",
            "endDate",
            "place",
            "eventType",
            "spaceId",
            "spaceName",
            "eventRole",
            "spaceMember");
    assertThat(item.get("eventId").asString()).isEqualTo(retreat.toString());
    assertThat(item.get("name").asString()).isEqualTo("Winter retreat");
    assertThat(item.get("lifecycleStatus").asString()).isEqualTo("DRAFT");
    assertThat(item.get("spaceId").asString()).isEqualTo(space.toString());
    assertThat(item.get("spaceName").asString()).isEqualTo("Grace Church");
    assertThat(item.get("eventRole").asString()).isEqualTo("STAFF");
    assertThat(item.get("spaceMember").asBoolean()).isFalse();
    // DEC-060: other events, other operators and member contact stay hidden.
    assertThat(body.toString()).doesNotContain(other.toString(), "Other event", "Owner");

    // The space list and the space event list stay closed to the collaborator.
    Cookie session = login(collaborator, null);
    JsonNode spaces = json.readTree(ok(session, "/api/v1/operator/spaces"));
    assertThat(spaces.get("items")).isEmpty();
    mvc.perform(get("/api/v1/operator/spaces/" + space + "/events").cookie(session))
        .andExpect(status().isNotFound());

    // The event itself opens and tells which organization runs it.
    JsonNode detail = json.readTree(ok(session, "/api/v1/operator/events/" + retreat));
    assertThat(detail.get("spaceId").asString()).isEqualTo(space.toString());
    assertThat(detail.get("spaceName").asString()).isEqualTo("Grace Church");
  }

  /** A member also helps on an event in another space. A space owner's view adds no rows. */
  @Test
  void memberSeesOwnEventsAndEventsInOtherSpaces() throws Exception {
    UUID person = user("Person");
    UUID home = space("Alpha church");
    UUID away = space("Bravo church");
    member(home, person, "MEMBER");
    UUID homeEvent = event(home, "B home event");
    UUID homeUnrelated = event(home, "Not mine");
    operator(home, homeEvent, person, "MANAGER");
    UUID awayEvent = event(away, "A away event");
    operator(away, awayEvent, person, "STAFF");
    UUID ownerElsewhere = space("Charlie church");
    member(ownerElsewhere, person, "OWNER");
    UUID ownerSees = event(ownerElsewhere, "Owner can read, no row");

    JsonNode body = list(login(person, null));
    List<String> ids = new ArrayList<>();
    body.get("items").forEach(item -> ids.add(item.get("eventId").asString()));
    // Name order across spaces: "A away event", then "B home event".
    assertThat(ids).containsExactly(awayEvent.toString(), homeEvent.toString());
    JsonNode away0 = body.get("items").get(0);
    assertThat(away0.get("spaceName").asString()).isEqualTo("Bravo church");
    assertThat(away0.get("eventRole").asString()).isEqualTo("STAFF");
    assertThat(away0.get("spaceMember").asBoolean()).isFalse();
    JsonNode home1 = body.get("items").get(1);
    assertThat(home1.get("spaceName").asString()).isEqualTo("Alpha church");
    assertThat(home1.get("eventRole").asString()).isEqualTo("MANAGER");
    assertThat(home1.get("spaceMember").asBoolean()).isTrue();
    assertThat(body.toString()).doesNotContain(homeUnrelated.toString(), ownerSees.toString());
  }

  /**
   * #387 journey 1: leave without keeping the event, then accept an event invitation. Access is
   * revoked at leave and comes back as an event-only collaborator.
   */
  @Test
  void leftMemberWhoDroppedTheEventIsInvitedAgainAndSeesIt() throws Exception {
    Fixture fx = seed();
    Cookie member = login(fx.memberId, "member@example.com");
    leave(member, fx.spaceId, "[]");
    assertThat(list(member).get("items")).isEmpty();
    mvc.perform(get("/api/v1/operator/events/" + fx.eventId).cookie(member))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("NOT_A_MEMBER"));

    Cookie owner = login(fx.ownerId, null);
    String token = invite(owner, fx.eventId, "member@example.com", "MANAGER");

    JsonNode preview = json.readTree(ok(postToken(member, "preview", token)));
    assertThat(preview.get("outcome").asString()).isEqualTo("PENDING");
    assertThat(preview.get("eventId").asString()).isEqualTo(fx.eventId.toString());
    JsonNode accepted = json.readTree(ok(postToken(member, "accept", token)));
    assertThat(accepted.get("outcome").asString()).isEqualTo("ACCEPTED");
    assertThat(accepted.get("eventId").asString()).isEqualTo(fx.eventId.toString());
    assertThat(accepted.get("role").asString()).isEqualTo("MANAGER");

    JsonNode body = list(member);
    assertThat(body.get("items")).hasSize(1);
    assertThat(body.get("items").get(0).get("eventId").asString()).isEqualTo(fx.eventId.toString());
    assertThat(body.get("items").get(0).get("eventRole").asString()).isEqualTo("MANAGER");
    assertThat(body.get("items").get(0).get("spaceMember").asBoolean()).isFalse();
    ok(member, "/api/v1/operator/events/" + fx.eventId);
    // The revoked-access audit from the leave does not block the re-added operator anywhere.
    assertThat(eventRole(fx.eventId, fx.memberId)).isEqualTo("MANAGER");
    assertThat(
            jdbc.queryForObject(
                "SELECT status FROM event_invitations WHERE event_id = ? AND email_normalized = ?",
                String.class,
                fx.eventId,
                "member@example.com"))
        .isEqualTo("ACCEPTED");
    ok(member, "/api/v1/operator/spaces/" + fx.spaceId + "/events/" + fx.eventId);
    ok(member, "/api/v1/operator/events/" + fx.eventId + "/operators");
    ok(member, "/api/v1/operator/events/" + fx.eventId + "/lifecycle");
    ok(member, "/api/v1/operator/events/" + fx.eventId + "/tasks");
    ok(member, "/api/v1/operator/events/" + fx.eventId + "/check-ins/summary");
    ok(member, "/api/v1/operator/events/" + fx.eventId + "/applications");

    // Opening the same link again is the only "already" answer, and it still names the event.
    JsonNode again = json.readTree(ok(postToken(member, "preview", token)));
    assertThat(again.get("outcome").asString()).isEqualTo("ALREADY_ACCEPTED");
    assertThat(again.get("eventId").asString()).isEqualTo(fx.eventId.toString());
    JsonNode reaccept = json.readTree(ok(postToken(member, "accept", token)));
    assertThat(reaccept.get("outcome").asString()).isEqualTo("ALREADY_ACCEPTED");
    assertThat(reaccept.get("role").asString()).isEqualTo("MANAGER");
  }

  /**
   * #387 journey 2: leave keeping the event. The person is still an operator, so the invitation is
   * a normal accept that keeps the role they have.
   */
  @Test
  void leftMemberWhoKeptTheEventAcceptsAndKeepsTheirRole() throws Exception {
    Fixture fx = seed();
    Cookie member = login(fx.memberId, "member@example.com");
    leave(member, fx.spaceId, "[\"" + fx.eventId + "\"]");

    JsonNode kept = list(member);
    assertThat(kept.get("items")).hasSize(1);
    assertThat(kept.get("items").get(0).get("eventRole").asString()).isEqualTo("STAFF");
    assertThat(kept.get("items").get(0).get("spaceMember").asBoolean()).isFalse();

    Cookie owner = login(fx.ownerId, null);
    String token = invite(owner, fx.eventId, "member@example.com", "MANAGER");
    JsonNode preview = json.readTree(ok(postToken(member, "preview", token)));
    assertThat(preview.get("outcome").asString()).isEqualTo("PENDING");
    JsonNode accepted = json.readTree(ok(postToken(member, "accept", token)));
    assertThat(accepted.get("outcome").asString()).isEqualTo("ACCEPTED");
    assertThat(accepted.get("role").asString()).isEqualTo("STAFF");
    assertThat(eventRole(fx.eventId, fx.memberId)).isEqualTo("STAFF");
    assertThat(list(member).get("items")).hasSize(1);
  }

  /** A revoked operator (the row is gone) is not listed, even with an audit record only. */
  @Test
  void revokedAccessIsNotListed() throws Exception {
    Fixture fx = seed();
    Cookie owner = login(fx.ownerId, null);
    mvc.perform(
            delete("/api/v1/operator/events/" + fx.eventId + "/operators/" + fx.memberId)
                .cookie(owner, csrf())
                .header(CSRF_HEADER, CSRF))
        .andExpect(status().isOk());
    Cookie member = login(fx.memberId, null);
    assertThat(list(member).get("items")).isEmpty();
  }

  private JsonNode list(Cookie session) throws Exception {
    return json.readTree(ok(session, PATH));
  }

  private String ok(Cookie session, String path) throws Exception {
    return mvc.perform(get(path).cookie(session))
        .andExpect(status().isOk())
        .andReturn()
        .getResponse()
        .getContentAsString();
  }

  private String ok(ResultActions actions) throws Exception {
    return actions.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
  }

  private void leave(Cookie session, UUID spaceId, String keep) throws Exception {
    mvc.perform(
            post("/api/v1/operator/spaces/" + spaceId + "/me/leave")
                .cookie(session, csrf())
                .header(CSRF_HEADER, CSRF)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"keepEventIds\":" + keep + "}"))
        .andExpect(status().isOk());
  }

  private String invite(Cookie owner, UUID eventId, String email, String role) throws Exception {
    mvc.perform(
            post("/api/v1/operator/events/" + eventId + "/invitations")
                .cookie(owner, csrf())
                .header(CSRF_HEADER, CSRF)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"role\":\"" + role + "\"}"))
        .andExpect(status().isOk());
    InvitationMail mail = mailer.sent().get(mailer.sent().size() - 1);
    assertThat(mail.fragmentLink()).startsWith(LINK_PREFIX);
    return mail.fragmentLink().substring(LINK_PREFIX.length());
  }

  private ResultActions postToken(Cookie session, String action, String token) throws Exception {
    return mvc.perform(
        post("/api/v1/operator/invitations/" + action)
            .cookie(session, csrf())
            .header(CSRF_HEADER, CSRF)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"token\":\"" + token + "\"}"));
  }

  private Cookie login(UUID userId, String email) throws Exception {
    String body =
        email == null
            ? "{\"userId\":\"" + userId + "\"}"
            : "{\"userId\":\"" + userId + "\",\"email\":\"" + email + "\"}";
    Cookie cookie =
        mvc.perform(
                post("/api/v1/operator/auth/login")
                    .cookie(csrf())
                    .header(CSRF_HEADER, CSRF)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(body))
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

  private Fixture seed() {
    UUID owner = user("Owner Kim");
    UUID memberId = user("Member Lee");
    UUID space = space("Leave church");
    member(space, owner, "OWNER");
    member(space, memberId, "MEMBER");
    UUID eventId = event(space, "Leave event");
    operator(space, eventId, owner, "OWNER");
    operator(space, eventId, memberId, "STAFF");
    return new Fixture(space, eventId, owner, memberId);
  }

  private UUID user(String name) {
    UUID id = UUID.randomUUID();
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, ?)", id, name);
    return id;
  }

  private UUID space(String name) {
    UUID id = UUID.randomUUID();
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, ?)", id, name);
    return id;
  }

  private void member(UUID spaceId, UUID userId, String role) {
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, ?)", spaceId, userId, role);
  }

  private UUID event(UUID spaceId, String name) {
    UUID id = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO events (id, space_id, name, lifecycle_status, lifecycle_version)"
            + " VALUES (?, ?, ?, 'DRAFT', 0)",
        id,
        spaceId,
        name);
    return id;
  }

  private void operator(UUID spaceId, UUID eventId, UUID userId, String role) {
    jdbc.update(
        "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, ?)",
        spaceId,
        eventId,
        userId,
        role);
  }

  private String eventRole(UUID eventId, UUID userId) {
    List<String> roles =
        jdbc.queryForList(
            "SELECT role FROM event_users WHERE event_id = ? AND user_id = ?",
            String.class,
            eventId,
            userId);
    return roles.isEmpty() ? null : roles.get(0);
  }

  private record Fixture(UUID spaceId, UUID eventId, UUID ownerId, UUID memberId) {}
}
