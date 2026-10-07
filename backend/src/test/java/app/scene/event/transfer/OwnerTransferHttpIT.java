package app.scene.event.transfer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.web.RequestIdFilter;
import app.scene.support.PostgresTestcontainer;
import jakarta.servlet.http.Cookie;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
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
 * DEC-063 owner-transfer HTTP, rows 12 and 13. Rows 1–11 and 14–19 stay out. Leave and the space
 * route stay closed.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class OwnerTransferHttpIT {

  private static final String OPERATOR_COOKIE = "placeholder-operator-session";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";
  private static final String ACCEPTED_AUDIT = "OWNER_TRANSFER_ACCEPTED";

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;

  private MockMvc mvc;

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

  /** Event owner requests a transfer. The recipient still has no owner authority. */
  @Test
  void eventOwnerRequestsATransferToAnActiveMember() throws Exception {
    Fixture fx = seed("ACTIVE");
    Cookie owner = login(fx.ownerId);
    Cookie staff = login(fx.staffId);
    assertThat(transferCount(fx.eventId)).isZero();

    String created =
        created(write(post(collection(fx.eventId)), owner, toUser(fx.staffId), "req-create"));
    JsonNode body = json.readTree(created);
    assertThat(body.propertyNames())
        .containsExactly(
            "transferId",
            "scope",
            "spaceId",
            "spaceName",
            "eventId",
            "eventName",
            "from",
            "to",
            "status",
            "outcome");
    assertThat(body.has("requestedAt")).isFalse();
    assertThat(body.has("acceptedAt")).isFalse();
    assertThat(body.has("handoverEndsAt")).isFalse();
    assertThat(body.get("scope").asString()).isEqualTo("EVENT");
    assertThat(body.get("spaceId").asString()).isEqualTo(fx.spaceId.toString());
    assertThat(body.get("spaceName").asString()).isEqualTo("Green Grove");
    assertThat(body.get("eventId").asString()).isEqualTo(fx.eventId.toString());
    assertThat(body.get("eventName").asString()).isEqualTo("Autumn Gathering");
    assertThat(body.get("status").asString()).isEqualTo("PENDING");
    assertThat(body.get("outcome").asString()).isEqualTo("REQUESTED");
    assertThat(body.get("from").propertyNames()).containsExactly("userId", "displayName");
    assertThat(body.get("from").get("userId").asString()).isEqualTo(fx.ownerId.toString());
    assertThat(body.get("from").get("displayName").asString()).isEqualTo("Event Owner");
    assertThat(body.get("to").get("userId").asString()).isEqualTo(fx.staffId.toString());
    assertThat(body.get("to").get("displayName").asString()).isEqualTo("Event Staff");
    assertThat(created).doesNotContain("email").doesNotContain("token").doesNotContain("session");
    UUID transferId = UUID.fromString(body.get("transferId").asString());
    assertThat(transferStatus(transferId)).isEqualTo("PENDING");
    assertThat(priorRole(transferId)).isNull();
    assertThat(acceptedAt(transferId)).isNull();
    assertThat(handoverEndsAt(transferId)).isNull();
    assertThat(snapshot(transferId)).isEqualTo("[]");
    assertThat(eventRole(fx, fx.staffId)).isEqualTo("STAFF");
    assertThat(audits(fx.eventId)).isZero();

    problem(
        write(post(end(fx.eventId)), staff, "{\"expectedLifecycleVersion\":0}", "req-owner-only"),
        403,
        "FORBIDDEN",
        "req-owner-only");
    assertThat(eventRole(fx, fx.staffId)).isEqualTo("STAFF");
    assertThat(transferStatus(transferId)).isEqualTo("PENDING");
  }

  @Test
  void inactiveOrMissingRecipientIsRejectedWithoutARow() throws Exception {
    Fixture fx = seed("ACTIVE");
    Cookie owner = login(fx.ownerId);
    UUID left = user("Left Member");
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role, status) VALUES (?, ?, 'MEMBER', 'LEFT')",
        fx.spaceId,
        left);
    UUID missing = UUID.randomUUID();

    String leftBody =
        problem(
            write(post(collection(fx.eventId)), owner, toUser(left), "req-left"),
            400,
            "VALIDATION_FAILED",
            "req-left");
    assertField(leftBody, "toUserId");
    String missingBody =
        problem(
            write(post(collection(fx.eventId)), owner, toUser(missing), "req-missing"),
            400,
            "VALIDATION_FAILED",
            "req-missing");
    assertField(missingBody, "toUserId");
    assertThat(transferCount(fx.eventId)).isZero();
  }

  @Test
  void managerAndSpaceOwnerCannotRequest() throws Exception {
    Fixture fx = seed("ACTIVE");
    Cookie manager = login(fx.managerId);
    jdbc.update(
        """
        INSERT INTO event_user_permissions (
          space_id, event_id, user_id, permission, effect, granted_by, granted_at)
        VALUES (?, ?, ?, 'EVENT_LIFECYCLE', 'GRANT', ?, now())
        """,
        fx.spaceId,
        fx.eventId,
        fx.managerId,
        fx.ownerId);
    problem(
        write(post(collection(fx.eventId)), manager, toUser(fx.staffId), "req-manager"),
        403,
        "FORBIDDEN",
        "req-manager");

    UUID spaceOwner = user("Space Owner");
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, 'OWNER')",
        fx.spaceId,
        spaceOwner);
    Cookie space = login(spaceOwner);
    problem(
        write(post(collection(fx.eventId)), space, toUser(fx.staffId), "req-space-owner"),
        403,
        "FORBIDDEN",
        "req-space-owner");

    UUID stranger = user("Stranger");
    problem(
        write(post(collection(fx.eventId)), login(stranger), toUser(fx.staffId), "req-stranger"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-stranger");

    UUID left = user("Ended Member");
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role, status) VALUES (?, ?, 'MEMBER', 'LEFT')",
        fx.spaceId,
        left);
    problem(
        write(post(collection(fx.eventId)), login(left), toUser(fx.staffId), "req-not-member"),
        403,
        "NOT_A_MEMBER",
        "req-not-member");
    assertThat(transferCount(fx.eventId)).isZero();
  }

  /** Row 12. A cancelled transfer cannot be accepted, and no HANDOVER row is written. */
  @Test
  void acceptingACancelledTransferDoesNotOpenHandover() throws Exception {
    Fixture fx = seed("ACTIVE");
    Cookie owner = login(fx.ownerId);
    Cookie staff = login(fx.staffId);
    UUID transferId = request(fx, owner, fx.staffId, "req-cancel-create");

    String cancelled = ok(command(post(transfer(transferId) + "/cancel"), owner, "req-cancel"));
    JsonNode cancelBody = json.readTree(cancelled);
    assertThat(cancelBody.get("status").asString()).isEqualTo("CANCELLED");
    assertThat(cancelBody.get("outcome").asString()).isEqualTo("CANCELLED");
    assertThat(cancelBody.has("handoverEndsAt")).isFalse();
    assertThat(transferStatus(transferId)).isEqualTo("CANCELLED");

    problem(
        command(post(transfer(transferId) + "/accept"), staff, "req-accept-cancelled"),
        409,
        "TRANSFER_NOT_PENDING",
        "req-accept-cancelled");
    assertThat(transferStatus(transferId)).isEqualTo("CANCELLED");
    assertThat(handoverCount(fx.eventId)).isZero();
    assertThat(eventRole(fx, fx.staffId)).isEqualTo("STAFF");
    assertThat(audits(fx.eventId, ACCEPTED_AUDIT)).isZero();
  }

  @Test
  void acceptingADeclinedTransferDoesNotOpenHandover() throws Exception {
    Fixture fx = seed("ACTIVE");
    Cookie owner = login(fx.ownerId);
    Cookie staff = login(fx.staffId);
    UUID transferId = request(fx, owner, fx.staffId, "req-decline-create");

    String declined = ok(command(post(transfer(transferId) + "/reject"), staff, "req-reject"));
    assertThat(json.readTree(declined).get("status").asString()).isEqualTo("DECLINED");
    assertThat(json.readTree(declined).get("outcome").asString()).isEqualTo("DECLINED");
    assertThat(transferStatus(transferId)).isEqualTo("DECLINED");
    assertThat(rejectedCount(fx.eventId)).isZero();

    problem(
        command(post(transfer(transferId) + "/accept"), staff, "req-accept-declined"),
        409,
        "TRANSFER_NOT_PENDING",
        "req-accept-declined");
    problem(
        command(post(transfer(transferId) + "/cancel"), owner, "req-cancel-declined"),
        409,
        "TRANSFER_NOT_PENDING",
        "req-cancel-declined");
    assertThat(transferStatus(transferId)).isEqualTo("DECLINED");
    assertThat(handoverCount(fx.eventId)).isZero();
    assertThat(eventRole(fx, fx.staffId)).isEqualTo("STAFF");
  }

  /** Rows 12's pair is above. Row 13 keeps the first handover end and writes one accept audit. */
  @Test
  void acceptThenAcceptAgainKeepsHandoverEnd() throws Exception {
    Fixture fx = seed("ACTIVE");
    Cookie owner = login(fx.ownerId);
    Cookie staff = login(fx.staffId);
    grant(fx, fx.staffId, "TASK_WRITE");
    UUID transferId = request(fx, owner, fx.staffId, "req-accept-create");

    problem(
        command(post(transfer(transferId) + "/accept"), owner, "req-accept-sender"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-accept-sender");
    assertThat(transferStatus(transferId)).isEqualTo("PENDING");

    String accepted = ok(command(post(transfer(transferId) + "/accept"), staff, "req-accept"));
    JsonNode first = json.readTree(accepted);
    assertThat(first.get("outcome").asString()).isEqualTo("ACCEPTED");
    assertThat(first.get("status").asString()).isEqualTo("HANDOVER");
    assertThat(first.has("requestedAt")).isFalse();
    Instant ends = Instant.parse(first.get("handoverEndsAt").asString());
    Instant acceptedAt = Instant.parse(first.get("acceptedAt").asString());
    assertThat(ends).isEqualTo(acceptedAt.plus(Duration.ofDays(14)));
    assertThat(ends).isEqualTo(handoverEndsAt(transferId));
    assertThat(acceptedAt).isEqualTo(this.acceptedAt(transferId));
    assertThat(eventRole(fx, fx.staffId)).isEqualTo("OWNER");
    assertThat(priorRole(transferId)).isEqualTo("STAFF");
    assertThat(overrideCount(fx, fx.staffId)).isZero();
    assertThat(snapshot(transferId)).contains("TASK_WRITE");
    assertThat(audits(fx.eventId, ACCEPTED_AUDIT)).isEqualTo(1);

    String again = ok(command(post(transfer(transferId) + "/accept"), staff, "req-accept-again"));
    JsonNode second = json.readTree(again);
    assertThat(second.get("outcome").asString()).isEqualTo("ALREADY_ACCEPTED");
    assertThat(second.get("status").asString()).isEqualTo("HANDOVER");
    assertThat(Instant.parse(second.get("handoverEndsAt").asString())).isEqualTo(ends);
    assertThat(handoverEndsAt(transferId)).isEqualTo(ends);
    assertThat(audits(fx.eventId, ACCEPTED_AUDIT)).isEqualTo(1);
    assertThat(audits(fx.eventId)).isEqualTo(1);
  }

  @Test
  void cancellingACompletedTransferIsRejected() throws Exception {
    Fixture fx = seed("ACTIVE");
    Cookie owner = login(fx.ownerId);
    UUID transferId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO owner_transfers (
          id, space_id, event_id, from_user_id, to_user_id, status, accepted_at, handover_ends_at)
        VALUES (?, ?, ?, ?, ?, 'COMPLETED', now() - interval '15 days', now() - interval '1 day')
        """,
        transferId,
        fx.spaceId,
        fx.eventId,
        fx.ownerId,
        fx.staffId);
    jdbc.update(
        "UPDATE event_users SET role = 'OWNER' WHERE event_id = ? AND user_id = ?",
        fx.eventId,
        fx.staffId);

    problem(
        command(post(transfer(transferId) + "/cancel"), owner, "req-cancel-completed"),
        409,
        "TRANSFER_COMPLETED",
        "req-cancel-completed");
    assertThat(transferStatus(transferId)).isEqualTo("COMPLETED");
    assertThat(eventRole(fx, fx.staffId)).isEqualTo("OWNER");
    assertThat(eventRole(fx, fx.ownerId)).isEqualTo("OWNER");
  }

  @Test
  void archivedEventAcceptsAPendingTransfer() throws Exception {
    Fixture fx = seed("ARCHIVED");
    Cookie owner = login(fx.ownerId);
    Cookie staff = login(fx.staffId);
    UUID transferId = request(fx, owner, fx.staffId, "req-archived-create");

    String accepted =
        ok(command(post(transfer(transferId) + "/accept"), staff, "req-archived-accept"));
    assertThat(json.readTree(accepted).get("outcome").asString()).isEqualTo("ACCEPTED");
    assertThat(accepted).doesNotContain("EVENT_ARCHIVED");
    assertThat(transferStatus(transferId)).isEqualTo("HANDOVER");
    assertThat(eventRole(fx, fx.staffId)).isEqualTo("OWNER");
    assertThat(audits(fx.eventId, ACCEPTED_AUDIT)).isEqualTo(1);
  }

  @Test
  void archivedDeclineAndCancelAreNotBlocked() throws Exception {
    Fixture fx = seed("ARCHIVED");
    Cookie owner = login(fx.ownerId);
    Cookie staff = login(fx.staffId);
    UUID declinedId = request(fx, owner, fx.staffId, "req-archived-decline-create");
    String declined =
        ok(command(post(transfer(declinedId) + "/reject"), staff, "req-archived-reject"));
    assertThat(json.readTree(declined).get("status").asString()).isEqualTo("DECLINED");
    assertThat(declined).doesNotContain("EVENT_ARCHIVED");

    UUID cancelledId = request(fx, owner, fx.managerId, "req-archived-cancel-create");
    String cancelled =
        ok(command(post(transfer(cancelledId) + "/cancel"), owner, "req-archived-cancel"));
    assertThat(json.readTree(cancelled).get("status").asString()).isEqualTo("CANCELLED");
    assertThat(cancelled).doesNotContain("EVENT_ARCHIVED");
    assertThat(eventRole(fx, fx.managerId)).isEqualTo("MANAGER");
  }

  @Test
  void cancelRestoresThePriorRoleAndOverridesWithoutChangingTasks() throws Exception {
    Fixture fx = seed("ACTIVE");
    Cookie owner = login(fx.ownerId);
    Cookie manager = login(fx.managerId);
    grant(fx, fx.managerId, "DATA_EXPORT");
    Timestamp grantedAt = grantedAt(fx, fx.managerId, "DATA_EXPORT");
    UUID transferId = request(fx, owner, fx.managerId, "req-restore-create");
    ok(command(post(transfer(transferId) + "/accept"), manager, "req-restore-accept"));
    UUID taskId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO tasks (id, space_id, event_id, title, status, version, assignee_user_id)
        VALUES (?, ?, ?, '안내', 'TODO', 0, ?)
        """,
        taskId,
        fx.spaceId,
        fx.eventId,
        fx.managerId);

    problem(
        command(post(transfer(transferId) + "/cancel"), login(fx.staffId), "req-restore-staff"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-restore-staff");
    String cancelled =
        ok(command(post(transfer(transferId) + "/cancel"), owner, "req-restore-cancel"));
    assertThat(json.readTree(cancelled).get("status").asString()).isEqualTo("CANCELLED");
    assertThat(transferStatus(transferId)).isEqualTo("CANCELLED");
    assertThat(eventRole(fx, fx.managerId)).isEqualTo("MANAGER");
    assertThat(overrideCount(fx, fx.managerId)).isEqualTo(1);
    assertThat(effect(fx, fx.managerId, "DATA_EXPORT")).isEqualTo("GRANT");
    assertThat(grantedBy(fx, fx.managerId, "DATA_EXPORT")).isEqualTo(fx.ownerId);
    assertThat(grantedAt(fx, fx.managerId, "DATA_EXPORT")).isEqualTo(grantedAt);
    assertThat(taskStatus(taskId)).isEqualTo("TODO");
    assertThat(taskVersion(taskId)).isZero();
    assertThat(assignee(taskId)).isEqualTo(fx.managerId);
    assertThat(audits(fx.eventId)).isEqualTo(1);

    problem(
        command(post(transfer(transferId) + "/cancel"), owner, "req-cancel-again"),
        409,
        "TRANSFER_NOT_PENDING",
        "req-cancel-again");
    assertThat(transferStatus(transferId)).isEqualTo("CANCELLED");
  }

  @Test
  void cancelOfHandoverRemovesAnOwnerRowThatAcceptInserted() throws Exception {
    Fixture fx = seed("ACTIVE");
    Cookie owner = login(fx.ownerId);
    UUID newbie = user("Newbie");
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, 'MEMBER')",
        fx.spaceId,
        newbie);
    UUID transferId = request(fx, owner, newbie, "req-newbie-create");
    ok(command(post(transfer(transferId) + "/accept"), login(newbie), "req-newbie-accept"));
    assertThat(eventRole(fx, newbie)).isEqualTo("OWNER");
    assertThat(priorRole(transferId)).isNull();

    ok(command(post(transfer(transferId) + "/cancel"), owner, "req-newbie-cancel"));
    assertThat(transferStatus(transferId)).isEqualTo("CANCELLED");
    assertThat(eventRole(fx, newbie)).isNull();
  }

  @Test
  void expiredHandoverCancelDoesNotBecomeCompleted() throws Exception {
    Fixture fx = seed("ACTIVE");
    Cookie owner = login(fx.ownerId);
    Cookie staff = login(fx.staffId);
    UUID transferId = request(fx, owner, fx.staffId, "req-expired-create");
    ok(command(post(transfer(transferId) + "/accept"), staff, "req-expired-accept"));
    jdbc.update(
        "UPDATE owner_transfers SET handover_ends_at = now() - interval '1 second' WHERE id = ?",
        transferId);

    String cancelled =
        ok(command(post(transfer(transferId) + "/cancel"), staff, "req-expired-cancel"));
    assertThat(json.readTree(cancelled).get("status").asString()).isEqualTo("CANCELLED");
    assertThat(cancelled).doesNotContain("TRANSFER_COMPLETED");
    assertThat(transferStatus(transferId)).isEqualTo("CANCELLED");
    assertThat(eventRole(fx, fx.staffId)).isEqualTo("STAFF");
  }

  @Test
  void aSecondPendingTransferFromTheSameSenderIsRejected() throws Exception {
    Fixture fx = seed("ACTIVE");
    Cookie owner = login(fx.ownerId);
    UUID first = request(fx, owner, fx.staffId, "req-first-pending");
    problem(
        write(post(collection(fx.eventId)), owner, toUser(fx.managerId), "req-second-pending"),
        409,
        "TRANSFER_NOT_PENDING",
        "req-second-pending");
    assertThat(transferCount(fx.eventId)).isEqualTo(1);
    assertThat(transferStatus(first)).isEqualTo("PENDING");
  }

  @Test
  void twoEventOwnersCanEachRequest() throws Exception {
    Fixture fx = seed("ACTIVE");
    UUID other = user("Other Owner");
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, 'MEMBER')", fx.spaceId, other);
    jdbc.update(
        "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, 'OWNER')",
        fx.spaceId,
        fx.eventId,
        other);
    request(fx, login(fx.ownerId), fx.staffId, "req-owner-a");
    request(fx, login(other), fx.managerId, "req-owner-b");
    assertThat(transferCount(fx.eventId)).isEqualTo(2);
  }

  @Test
  void getIsLimitedToThePartiesAndAnEventOwner() throws Exception {
    Fixture fx = seed("ACTIVE");
    Cookie owner = login(fx.ownerId);
    Cookie staff = login(fx.staffId);
    Cookie manager = login(fx.managerId);
    UUID other = user("Other Owner");
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, 'MEMBER')", fx.spaceId, other);
    jdbc.update(
        "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, 'OWNER')",
        fx.spaceId,
        fx.eventId,
        other);
    UUID transferId = request(fx, owner, fx.staffId, "req-get-create");

    String sender = ok(read(owner, transfer(transferId), "req-get-sender"));
    assertThat(json.readTree(sender).has("outcome")).isFalse();
    assertThat(json.readTree(sender).has("requestedAt")).isFalse();
    assertThat(json.readTree(sender).get("status").asString()).isEqualTo("PENDING");
    assertThat(sender).doesNotContain("email").doesNotContain("token").doesNotContain("session");
    assertThat(ok(read(staff, transfer(transferId), "req-get-recipient"))).contains("PENDING");
    assertThat(ok(read(login(other), transfer(transferId), "req-get-owner"))).contains("PENDING");

    problem(
        read(manager, transfer(transferId), "req-get-manager"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-get-manager");
    UUID stranger = user("Stranger");
    problem(
        read(login(stranger), transfer(transferId), "req-get-stranger"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-get-stranger");
    problem(
        read(owner, transfer(UUID.randomUUID()), "req-get-missing"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-get-missing");

    problem(
        command(post(transfer(transferId) + "/cancel"), staff, "req-recipient-cancel"),
        403,
        "FORBIDDEN",
        "req-recipient-cancel");
    problem(
        command(post(transfer(transferId) + "/cancel"), login(other), "req-other-owner-cancel"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-other-owner-cancel");
    assertThat(transferStatus(transferId)).isEqualTo("PENDING");
  }

  private UUID request(Fixture fx, Cookie owner, UUID toUserId, String requestId) throws Exception {
    String created =
        created(write(post(collection(fx.eventId)), owner, toUser(toUserId), requestId));
    return UUID.fromString(json.readTree(created).get("transferId").asString());
  }

  private void assertField(String body, String field) throws Exception {
    JsonNode errors = json.readTree(body).get("errors");
    assertThat(errors).isNotNull();
    assertThat(errors).hasSize(1);
    assertThat(errors.get(0).get("field").asString()).isEqualTo(field);
  }

  private MockHttpServletRequestBuilder read(Cookie session, String path, String requestId) {
    return get(path).cookie(session).header("X-Request-Id", requestId);
  }

  private static MockHttpServletRequestBuilder write(
      MockHttpServletRequestBuilder request, Cookie session, String body, String requestId) {
    return request
        .cookie(session, csrf())
        .header(CSRF_HEADER, CSRF)
        .header("X-Request-Id", requestId)
        .contentType(MediaType.APPLICATION_JSON)
        .content(body);
  }

  private static MockHttpServletRequestBuilder command(
      MockHttpServletRequestBuilder request, Cookie session, String requestId) {
    return request
        .cookie(session, csrf())
        .header(CSRF_HEADER, CSRF)
        .header("X-Request-Id", requestId);
  }

  private String created(MockHttpServletRequestBuilder request) throws Exception {
    return mvc.perform(request)
        .andExpect(status().isCreated())
        .andExpect(header().doesNotExist("Location"))
        .andReturn()
        .getResponse()
        .getContentAsString();
  }

  private String ok(MockHttpServletRequestBuilder request) throws Exception {
    return mvc.perform(request)
        .andExpect(status().isOk())
        .andReturn()
        .getResponse()
        .getContentAsString();
  }

  private String problem(
      MockHttpServletRequestBuilder request, int httpStatus, String code, String requestId)
      throws Exception {
    return mvc.perform(request)
        .andExpect(status().is(httpStatus))
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.code").value(code))
        .andExpect(jsonPath("$.traceId").value(requestId))
        .andExpect(header().string("X-Request-Id", requestId))
        .andReturn()
        .getResponse()
        .getContentAsString();
  }

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

  private static String toUser(UUID userId) {
    return "{\"toUserId\":\"" + userId + "\"}";
  }

  private static String collection(UUID eventId) {
    return "/api/v1/operator/events/" + eventId + "/owner-transfers";
  }

  private static String transfer(UUID transferId) {
    return "/api/v1/operator/owner-transfers/" + transferId;
  }

  private static String end(UUID eventId) {
    return "/api/v1/operator/events/" + eventId + "/end";
  }

  private Fixture seed(String lifecycle) {
    Fixture fx = Fixture.create();
    user(fx.ownerId, "Event Owner");
    user(fx.managerId, "Event Manager");
    user(fx.staffId, "Event Staff");
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, 'Green Grove')", fx.spaceId);
    member(fx.spaceId, fx.ownerId, "MEMBER");
    member(fx.spaceId, fx.managerId, "MEMBER");
    member(fx.spaceId, fx.staffId, "MEMBER");
    jdbc.update(
        """
        INSERT INTO events (id, space_id, name, lifecycle_status, lifecycle_version)
        VALUES (?, ?, 'Autumn Gathering', ?, 0)
        """,
        fx.eventId,
        fx.spaceId,
        lifecycle);
    operator(fx, fx.ownerId, "OWNER");
    operator(fx, fx.managerId, "MANAGER");
    operator(fx, fx.staffId, "STAFF");
    return fx;
  }

  private void user(UUID id, String name) {
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, ?)", id, name);
  }

  private UUID user(String name) {
    UUID id = UUID.randomUUID();
    user(id, name);
    return id;
  }

  private void member(UUID spaceId, UUID userId, String role) {
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, ?)", spaceId, userId, role);
  }

  private void operator(Fixture fx, UUID userId, String role) {
    jdbc.update(
        "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, ?)",
        fx.spaceId,
        fx.eventId,
        userId,
        role);
  }

  private void grant(Fixture fx, UUID userId, String permission) {
    jdbc.update(
        """
        INSERT INTO event_user_permissions (
          space_id, event_id, user_id, permission, effect, granted_by, granted_at)
        VALUES (?, ?, ?, ?, 'GRANT', ?, now())
        """,
        fx.spaceId,
        fx.eventId,
        userId,
        permission,
        fx.ownerId);
  }

  private String transferStatus(UUID transferId) {
    return jdbc.queryForObject(
        "SELECT status FROM owner_transfers WHERE id = ?", String.class, transferId);
  }

  private String priorRole(UUID transferId) {
    return jdbc.query(
            "SELECT recipient_prior_role FROM owner_transfers WHERE id = ?",
            (rs, row) -> rs.getString(1),
            transferId)
        .getFirst();
  }

  private String snapshot(UUID transferId) {
    return jdbc.queryForObject(
        "SELECT CAST(permission_snapshot AS text) FROM owner_transfers WHERE id = ?",
        String.class,
        transferId);
  }

  private Instant acceptedAt(UUID transferId) {
    return instant("SELECT accepted_at FROM owner_transfers WHERE id = ?", transferId);
  }

  private Instant handoverEndsAt(UUID transferId) {
    return instant("SELECT handover_ends_at FROM owner_transfers WHERE id = ?", transferId);
  }

  private Instant instant(String sql, UUID transferId) {
    Timestamp timestamp = jdbc.queryForObject(sql, Timestamp.class, transferId);
    return timestamp == null ? null : timestamp.toInstant();
  }

  private String eventRole(Fixture fx, UUID userId) {
    return jdbc
        .query(
            "SELECT role FROM event_users WHERE event_id = ? AND user_id = ?",
            (rs, row) -> rs.getString(1),
            fx.eventId,
            userId)
        .stream()
        .findFirst()
        .orElse(null);
  }

  private int transferCount(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM owner_transfers WHERE event_id = ?", Integer.class, eventId);
  }

  private int handoverCount(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM owner_transfers WHERE event_id = ? AND status = 'HANDOVER'",
        Integer.class,
        eventId);
  }

  private int rejectedCount(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM owner_transfers WHERE event_id = ? AND status = 'REJECTED'",
        Integer.class,
        eventId);
  }

  private int overrideCount(Fixture fx, UUID userId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM event_user_permissions WHERE event_id = ? AND user_id = ?",
        Integer.class,
        fx.eventId,
        userId);
  }

  private String effect(Fixture fx, UUID userId, String permission) {
    return jdbc.queryForObject(
        """
        SELECT effect FROM event_user_permissions
        WHERE event_id = ? AND user_id = ? AND permission = ?
        """,
        String.class,
        fx.eventId,
        userId,
        permission);
  }

  private UUID grantedBy(Fixture fx, UUID userId, String permission) {
    return jdbc.queryForObject(
        """
        SELECT granted_by FROM event_user_permissions
        WHERE event_id = ? AND user_id = ? AND permission = ?
        """,
        UUID.class,
        fx.eventId,
        userId,
        permission);
  }

  private Timestamp grantedAt(Fixture fx, UUID userId, String permission) {
    return jdbc.queryForObject(
        """
        SELECT granted_at FROM event_user_permissions
        WHERE event_id = ? AND user_id = ? AND permission = ?
        """,
        Timestamp.class,
        fx.eventId,
        userId,
        permission);
  }

  private int audits(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_logs WHERE event_id = ?", Integer.class, eventId);
  }

  private int audits(UUID eventId, String action) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_logs WHERE event_id = ? AND action = ?",
        Integer.class,
        eventId,
        action);
  }

  private String taskStatus(UUID taskId) {
    return jdbc.queryForObject("SELECT status FROM tasks WHERE id = ?", String.class, taskId);
  }

  private int taskVersion(UUID taskId) {
    return jdbc.queryForObject("SELECT version FROM tasks WHERE id = ?", Integer.class, taskId);
  }

  private UUID assignee(UUID taskId) {
    return jdbc.queryForObject(
        "SELECT assignee_user_id FROM tasks WHERE id = ?", UUID.class, taskId);
  }

  private record Fixture(UUID spaceId, UUID eventId, UUID ownerId, UUID managerId, UUID staffId) {
    static Fixture create() {
      return new Fixture(
          UUID.randomUUID(),
          UUID.randomUUID(),
          UUID.randomUUID(),
          UUID.randomUUID(),
          UUID.randomUUID());
    }
  }
}
