package app.scene.event.task;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.audit.AuditActions;
import app.scene.common.web.RequestIdFilter;
import app.scene.support.PostgresTestcontainer;
import jakarta.servlet.http.Cookie;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * DEC-062 task command HTTP. Rows 19, 23, and 30–35. Row 36 asserts the existing operator-removal
 * path. Row 8 completes an empty task through the existing complete route. Create is 201.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class TaskCommandHttpIT {

  private static final String OPERATOR_COOKIE = "placeholder-operator-session";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;

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
   * Create is 201. An empty checklist still completes through the existing complete route (row 8).
   */
  @Test
  void ownerCreatesATodoTaskAndCompletesTheEmptyChecklist() throws Exception {
    Fixture fx = seed("ACTIVE");
    Cookie owner = login(fx.ownerId);
    assertThat(taskCount(fx.eventId)).isZero();

    String created =
        created(
            post(tasks(fx.eventId))
                .cookie(owner, csrf())
                .header(CSRF_HEADER, CSRF)
                .header("X-Request-Id", "req-create")
                .header("Idempotency-Key", "same-key")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"  안내  \",\"items\":[{\"label\":\"ignored\"}]}"));
    JsonNode body = json.readTree(created);
    assertThat(body.propertyNames())
        .containsExactly(
            "taskId",
            "title",
            "status",
            "version",
            "checklist",
            "assigneeUserId",
            "assigneeDisplayName",
            "completedByUserId",
            "completedByDisplayName",
            "completedAt",
            "actions",
            "outcome");
    UUID taskId = UUID.fromString(body.get("taskId").asString());
    assertThat(body.get("title").asString()).isEqualTo("안내");
    assertThat(body.get("status").asString()).isEqualTo("TODO");
    assertThat(body.get("version").asInt()).isZero();
    assertThat(body.get("assigneeUserId").isNull()).isTrue();
    assertThat(body.get("assigneeDisplayName").isNull()).isTrue();
    assertThat(body.get("completedByUserId").isNull()).isTrue();
    assertThat(body.get("completedAt").isNull()).isTrue();
    assertThat(body.get("outcome").isNull()).isTrue();
    assertThat(body.get("checklist").get("done").asInt()).isZero();
    assertThat(body.get("checklist").get("total").asInt()).isZero();
    assertThat(body.get("checklist").get("items")).isEmpty();
    assertThat(body.get("actions").get("canCheck").asBoolean()).isTrue();
    assertThat(body.get("actions").get("canComplete").asBoolean()).isTrue();
    assertThat(body.get("actions").get("canReopen").asBoolean()).isFalse();
    assertThat(body.get("actions").get("blockedReason").isNull()).isTrue();
    assertThat(created).doesNotContain("email", "token", "session");
    assertThat(taskTitle(taskId)).isEqualTo("안내");
    assertThat(taskStatus(taskId)).isEqualTo("TODO");
    assertThat(taskVersion(taskId)).isZero();
    assertThat(auditRows(fx.eventId)).isZero();

    String again =
        created(
            write(
                    post(tasks(fx.eventId)),
                    owner,
                    "{\"title\":\"둘째\",\"assigneeUserId\":null}",
                    "req-create-2")
                .header("Idempotency-Key", "same-key"));
    assertThat(json.readTree(again).get("taskId").asString()).isNotEqualTo(taskId.toString());
    assertThat(taskCount(fx.eventId)).isEqualTo(2);

    String assigned =
        created(
            write(
                post(tasks(fx.eventId)),
                owner,
                "{\"title\":\"담당\",\"assigneeUserId\":\"" + fx.managerId + "\"}",
                "req-create-assignee"));
    JsonNode withAssignee = json.readTree(assigned);
    assertThat(withAssignee.get("status").asString()).isEqualTo("TODO");
    assertThat(withAssignee.get("version").asInt()).isZero();
    assertThat(withAssignee.get("assigneeUserId").asString()).isEqualTo(fx.managerId.toString());
    assertThat(withAssignee.get("assigneeDisplayName").asString()).isEqualTo("Event Manager");
    assertThat(withAssignee.get("completedByUserId").isNull()).isTrue();

    String detail = ok(read(owner, taskPath(fx.eventId, taskId), "req-detail"));
    assertThat(json.readTree(detail).get("title").asString()).isEqualTo("안내");
    assertThat(json.readTree(detail).get("version").asInt()).isZero();
    assertThat(json.readTree(detail).get("outcome").isNull()).isTrue();

    String completed =
        ok(
            write(
                post(taskPath(fx.eventId, taskId) + "/complete"),
                owner,
                "{\"version\":0}",
                "req-empty-complete"));
    assertThat(json.readTree(completed).get("outcome").asString()).isEqualTo("COMPLETED");
    assertThat(json.readTree(completed).get("status").asString()).isEqualTo("DONE");
    assertThat(json.readTree(completed).has("title")).isFalse();
    assertThat(taskStatus(taskId)).isEqualTo("DONE");
  }

  @Test
  void createRejectsTitleAndANonOperatorAssignee() throws Exception {
    Fixture fx = seed("ACTIVE");
    Cookie owner = login(fx.ownerId);
    UUID outsider = user("Outsider");
    member(fx.spaceId, outsider, "MEMBER");
    UUID otherEvent = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO events (id, space_id, name, lifecycle_status, lifecycle_version)
        VALUES (?, ?, 'other', 'ACTIVE', 0)
        """,
        otherEvent,
        fx.spaceId);
    UUID otherOperator = user("Other Operator");
    jdbc.update(
        "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, 'STAFF')",
        fx.spaceId,
        otherEvent,
        otherOperator);

    problem(
        write(post(tasks(fx.eventId)), owner, "{}", "req-missing"),
        400,
        "VALIDATION_FAILED",
        "req-missing");
    assertField(
        "req-missing-body",
        problem(
            write(post(tasks(fx.eventId)), owner, "{}", "req-missing-body"),
            400,
            "VALIDATION_FAILED",
            "req-missing-body"),
        "title");
    assertField(
        "blank",
        problem(
            write(post(tasks(fx.eventId)), owner, "{\"title\":\"   \"}", "req-blank"),
            400,
            "VALIDATION_FAILED",
            "req-blank"),
        "title");
    assertField(
        "null-title",
        problem(
            write(post(tasks(fx.eventId)), owner, "{\"title\":null}", "req-null-title"),
            400,
            "VALIDATION_FAILED",
            "req-null-title"),
        "title");
    String tooLong = "가".repeat(201);
    assertField(
        "long",
        problem(
            write(post(tasks(fx.eventId)), owner, "{\"title\":\"" + tooLong + "\"}", "req-long"),
            400,
            "VALIDATION_FAILED",
            "req-long"),
        "title");
    assertField(
        "title-wins",
        problem(
            write(
                post(tasks(fx.eventId)),
                owner,
                "{\"assigneeUserId\":\"not-a-uuid\"}",
                "req-title-wins"),
            400,
            "VALIDATION_FAILED",
            "req-title-wins"),
        "title");
    assertField(
        "outsider",
        problem(
            write(
                post(tasks(fx.eventId)),
                owner,
                "{\"title\":\" outsider \",\"assigneeUserId\":\"" + outsider + "\"}",
                "req-outsider"),
            400,
            "VALIDATION_FAILED",
            "req-outsider"),
        "assigneeUserId");
    assertField(
        "other-event",
        problem(
            write(
                post(tasks(fx.eventId)),
                owner,
                "{\"title\":\"other\",\"assigneeUserId\":\"" + otherOperator + "\"}",
                "req-other-operator"),
            400,
            "VALIDATION_FAILED",
            "req-other-operator"),
        "assigneeUserId");
    assertThat(taskCount(fx.eventId)).isZero();

    String boundary = "나".repeat(200);
    String created =
        created(
            write(
                post(tasks(fx.eventId)),
                owner,
                "{\"title\":\"" + boundary + "\"}",
                "req-boundary"));
    assertThat(json.readTree(created).get("title").asString()).hasSize(200);
    assertThat(taskCount(fx.eventId)).isEqualTo(1);
  }

  /** Create, patch, and delete are not the assignee exception. A bad body stays 403. */
  @Test
  void staffWithoutTaskWriteCannotCreatePatchOrDelete() throws Exception {
    Fixture fx = seed("ACTIVE");
    UUID taskId = task(fx, "안내", "TODO", fx.staffId);
    item(fx, taskId, "확인", 1, false);
    Cookie staff = login(fx.staffId);

    problem(
        write(post(tasks(fx.eventId)), staff, "{}", "req-staff-create"),
        403,
        "FORBIDDEN",
        "req-staff-create");
    problem(
        write(patch(taskPath(fx.eventId, taskId)), staff, "{\"title\":\"\"}", "req-staff-patch"),
        403,
        "FORBIDDEN",
        "req-staff-patch");
    problem(
        write(
            patch(taskPath(fx.eventId, taskId)),
            staff,
            "{\"status\":\"DONE\"}",
            "req-staff-status"),
        403,
        "FORBIDDEN",
        "req-staff-status");
    problem(
        delete(taskPath(fx.eventId, taskId))
            .cookie(staff, csrf())
            .header(CSRF_HEADER, CSRF)
            .header("X-Request-Id", "req-staff-delete"),
        403,
        "FORBIDDEN",
        "req-staff-delete");
    assertThat(taskCount(fx.eventId)).isEqualTo(1);
    assertThat(taskTitle(taskId)).isEqualTo("안내");
    assertThat(taskStatus(taskId)).isEqualTo("TODO");
    assertThat(taskVersion(taskId)).isZero();
    assertThat(assignee(taskId)).isEqualTo(fx.staffId);
    assertThat(itemsOnTask(taskId)).isEqualTo(1);
  }

  /** Row 19. Space OWNER and ADMIN may read. Their write is 403. A missing task is 404 first. */
  @Test
  void spaceOwnerAndAdminReadButCannotWrite() throws Exception {
    Fixture fx = seed("ACTIVE");
    UUID taskId = task(fx, "안내", "TODO", fx.staffId);
    UUID itemId = item(fx, taskId, "문구", 1, false);
    UUID spaceOwner = user("Space Owner");
    UUID spaceAdmin = user("Space Admin");
    UUID spaceMember = user("Space Member");
    UUID stranger = user("Stranger");
    member(fx.spaceId, spaceOwner, "OWNER");
    member(fx.spaceId, spaceAdmin, "ADMIN");
    member(fx.spaceId, spaceMember, "MEMBER");
    Cookie owner = login(spaceOwner);
    Cookie admin = login(spaceAdmin);
    Cookie member = login(spaceMember);

    String listed = ok(read(owner, tasks(fx.eventId), "req-owner-list"));
    JsonNode list = json.readTree(listed);
    assertThat(list.get("items")).hasSize(1);
    assertThat(list.get("items").get(0).has("itemId")).isFalse();
    assertThat(list.get("items").get(0).get("checklist").has("items")).isFalse();
    String ownerDetail = ok(read(owner, taskPath(fx.eventId, taskId), "req-owner-detail"));
    assertThat(json.readTree(ownerDetail).get("title").asString()).isEqualTo("안내");
    assertThat(json.readTree(ownerDetail).get("actions").get("blockedReason").asString())
        .isEqualTo("FORBIDDEN");
    problem(
        write(post(tasks(fx.eventId)), owner, "{}", "req-owner-post"),
        403,
        "FORBIDDEN",
        "req-owner-post");

    String adminList = ok(read(admin, tasks(fx.eventId), "req-admin-list"));
    assertThat(json.readTree(adminList).get("items")).hasSize(1);
    String adminDetail = ok(read(admin, taskPath(fx.eventId, taskId), "req-admin-detail"));
    JsonNode detail = json.readTree(adminDetail);
    assertThat(detail.get("checklist").get("items")).hasSize(1);
    assertThat(detail.get("actions").get("canCheck").asBoolean()).isFalse();
    assertThat(detail.get("actions").get("blockedReason").asString()).isEqualTo("FORBIDDEN");
    problem(
        write(
            put(taskPath(fx.eventId, taskId) + "/items/" + itemId),
            admin,
            "{\"checked\":true}",
            "req-admin-check"),
        403,
        "FORBIDDEN",
        "req-admin-check");
    assertThat(checked(itemId)).isFalse();
    assertThat(taskVersion(taskId)).isZero();

    problem(
        read(member, tasks(fx.eventId) + "?size=101", "req-member-list"),
        403,
        "FORBIDDEN",
        "req-member-list");
    problem(
        read(member, taskPath(fx.eventId, taskId), "req-member-detail"),
        403,
        "FORBIDDEN",
        "req-member-detail");
    problem(
        read(member, taskPath(fx.eventId, UUID.randomUUID()), "req-member-missing"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-member-missing");
    problem(
        read(login(stranger), tasks(fx.eventId), "req-stranger"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-stranger");
    assertThat(taskCount(fx.eventId)).isEqualTo(1);
  }

  /** Rows 30, 32, 33, and 34. Status TODO, DOING, and DONE are rejected. A cancelled task stays. */
  @Test
  void patchRejectsDoneDoingAndTodo() throws Exception {
    Fixture fx = seed("ACTIVE");
    UUID todo = task(fx, "할 일", "TODO", fx.ownerId);
    UUID doing = task(fx, "진행", "DOING", fx.ownerId);
    UUID done = task(fx, "완료", "DONE", fx.ownerId);
    UUID cancelled = task(fx, "취소", "CANCELLED", fx.ownerId);
    Cookie owner = login(fx.ownerId);

    assertRejectedStatus(fx, owner, todo, "DONE", "TODO");
    assertRejectedStatus(fx, owner, todo, "DOING", "TODO");
    assertRejectedStatus(fx, owner, done, "DOING", "DONE");
    assertRejectedStatus(fx, owner, doing, "TODO", "DOING");
    assertRejectedStatus(fx, owner, cancelled, "TODO", "CANCELLED");
    problem(
        write(
            patch(taskPath(fx.eventId, todo)),
            owner,
            "{\"title\":\"새 제목\",\"status\":\"DONE\"}",
            "req-title-and-done"),
        400,
        "VALIDATION_FAILED",
        "req-title-and-done");
    assertThat(taskTitle(todo)).isEqualTo("할 일");
    assertThat(taskStatus(todo)).isEqualTo("TODO");
    assertThat(taskVersion(todo)).isZero();
    assertField(
        "title-first",
        problem(
            write(
                patch(taskPath(fx.eventId, todo)),
                owner,
                "{\"title\":\"\",\"assigneeUserId\":\"nope\",\"status\":\"DONE\"}",
                "req-title-first"),
            400,
            "VALIDATION_FAILED",
            "req-title-first"),
        "title");
    assertField(
        "assignee-next",
        problem(
            write(
                patch(taskPath(fx.eventId, todo)),
                owner,
                "{\"title\":\"괜찮음\",\"assigneeUserId\":\"nope\",\"status\":\"DONE\"}",
                "req-assignee-next"),
            400,
            "VALIDATION_FAILED",
            "req-assignee-next"),
        "assigneeUserId");
    assertThat(taskTitle(todo)).isEqualTo("할 일");
    assertThat(assignee(todo)).isEqualTo(fx.ownerId);
    problem(
        write(patch(taskPath(fx.eventId, todo)), owner, "[]", "req-array"),
        400,
        "VALIDATION_FAILED",
        "req-array");
    assertThat(json.readTree(lastProblem).has("errors")).isFalse();
  }

  /** Row 31. Cancel is the only accepted status. A later item check uses the progress route. */
  @Test
  void cancelIncrementsVersionAndALaterCheckStaysCancelled() throws Exception {
    Fixture fx = seed("ACTIVE");
    UUID taskId = task(fx, "안내", "TODO", fx.staffId);
    UUID itemId = item(fx, taskId, "문구", 1, false);
    Cookie owner = login(fx.ownerId);

    String cancelled =
        ok(
            write(
                patch(taskPath(fx.eventId, taskId)),
                owner,
                "{\"status\":\"CANCELLED\"}",
                "req-cancel"));
    JsonNode body = json.readTree(cancelled);
    assertThat(body.get("status").asString()).isEqualTo("CANCELLED");
    assertThat(body.get("version").asInt()).isEqualTo(1);
    assertThat(body.get("title").asString()).isEqualTo("안내");
    assertThat(body.get("outcome").isNull()).isTrue();
    assertThat(body.get("actions").get("blockedReason").asString()).isEqualTo("TASK_CANCELLED");
    assertThat(body.get("checklist").get("total").asInt()).isEqualTo(1);
    assertThat(taskStatus(taskId)).isEqualTo("CANCELLED");
    assertThat(taskVersion(taskId)).isEqualTo(1);
    assertThat(checked(itemId)).isFalse();
    assertThat(auditRows(fx.eventId)).isZero();

    String check =
        problem(
            write(
                put(taskPath(fx.eventId, taskId) + "/items/" + itemId),
                owner,
                "{\"checked\":true}",
                "req-after-cancel"),
            409,
            "INVALID_TASK_STATE",
            "req-after-cancel");
    assertThat(json.readTree(check).get("reason").asString()).isEqualTo("TASK_CANCELLED");
    assertThat(json.readTree(check).get("task").has("outcome")).isFalse();
    assertThat(json.readTree(check).get("task").has("title")).isFalse();
    assertThat(taskStatus(taskId)).isEqualTo("CANCELLED");
    assertThat(taskVersion(taskId)).isEqualTo(1);
    assertThat(checked(itemId)).isFalse();

    UUID done = task(fx, "완료", "DONE", fx.ownerId);
    jdbc.update(
        "UPDATE tasks SET completed_by_user_id = ?, completed_at = now(), version = 3 WHERE id = ?",
        fx.ownerId,
        done);
    String kept =
        ok(
            write(
                patch(taskPath(fx.eventId, done)),
                owner,
                "{\"status\":\"CANCELLED\"}",
                "req-cancel-done"));
    assertThat(json.readTree(kept).get("status").asString()).isEqualTo("CANCELLED");
    assertThat(json.readTree(kept).get("version").asInt()).isEqualTo(4);
    assertThat(json.readTree(kept).get("completedByUserId").asString())
        .isEqualTo(fx.ownerId.toString());
    assertThat(completedBy(done)).isEqualTo(fx.ownerId);

    String same =
        ok(
            write(
                patch(taskPath(fx.eventId, taskId)),
                owner,
                "{\"status\":\"CANCELLED\"}",
                "req-cancel-same"));
    assertThat(json.readTree(same).get("version").asInt()).isEqualTo(1);
    assertThat(taskVersion(taskId)).isEqualTo(1);
  }

  /** Row 35. A title-only change does not increment version. Assignee set or clear does, once. */
  @Test
  void titleDoesNotIncrementVersionAndAssigneeDoes() throws Exception {
    Fixture fx = seed("ACTIVE");
    UUID taskId = task(fx, "안내", "DOING", fx.staffId);
    Cookie owner = login(fx.ownerId);

    String titled =
        ok(
            write(
                patch(taskPath(fx.eventId, taskId)),
                owner,
                "{\"title\":\"  새 제목  \",\"version\":99}",
                "req-title"));
    assertThat(json.readTree(titled).get("title").asString()).isEqualTo("새 제목");
    assertThat(json.readTree(titled).get("status").asString()).isEqualTo("DOING");
    assertThat(json.readTree(titled).get("version").asInt()).isZero();
    assertThat(json.readTree(titled).get("assigneeUserId").asString())
        .isEqualTo(fx.staffId.toString());
    assertThat(taskVersion(taskId)).isZero();
    assertThat(taskTitle(taskId)).isEqualTo("새 제목");

    String unchanged =
        ok(
            write(
                patch(taskPath(fx.eventId, taskId)),
                owner,
                "{\"title\":\"  새 제목  \"}",
                "req-title-same"));
    assertThat(json.readTree(unchanged).get("version").asInt()).isZero();
    assertThat(taskVersion(taskId)).isZero();

    String tooLong = "가".repeat(201);
    problem(
        write(
            patch(taskPath(fx.eventId, taskId)),
            owner,
            "{\"title\":\"" + tooLong + "\"}",
            "req-patch-long"),
        400,
        "VALIDATION_FAILED",
        "req-patch-long");
    assertThat(taskTitle(taskId)).isEqualTo("새 제목");
    assertThat(taskVersion(taskId)).isZero();

    String assigned =
        ok(
            write(
                patch(taskPath(fx.eventId, taskId)),
                owner,
                "{\"assigneeUserId\":\"" + fx.managerId + "\"}",
                "req-assignee"));
    assertThat(json.readTree(assigned).get("assigneeUserId").asString())
        .isEqualTo(fx.managerId.toString());
    assertThat(json.readTree(assigned).get("assigneeDisplayName").asString())
        .isEqualTo("Event Manager");
    assertThat(json.readTree(assigned).get("status").asString()).isEqualTo("DOING");
    assertThat(json.readTree(assigned).get("version").asInt()).isEqualTo(1);
    assertThat(taskVersion(taskId)).isEqualTo(1);
    assertThat(auditCount(fx.eventId, AuditActions.TASK_ASSIGNEE_CLEARED)).isZero();

    String sameAssignee =
        ok(
            write(
                patch(taskPath(fx.eventId, taskId)),
                owner,
                "{\"assigneeUserId\":\"" + fx.managerId + "\"}",
                "req-assignee-same"));
    assertThat(json.readTree(sameAssignee).get("version").asInt()).isEqualTo(1);

    String cleared =
        ok(
            write(
                patch(taskPath(fx.eventId, taskId)),
                owner,
                "{\"assigneeUserId\":null}",
                "req-clear"));
    assertThat(json.readTree(cleared).get("assigneeUserId").isNull()).isTrue();
    assertThat(json.readTree(cleared).get("version").asInt()).isEqualTo(2);
    assertThat(assignee(taskId)).isNull();
    assertThat(auditCount(fx.eventId, AuditActions.TASK_ASSIGNEE_CLEARED)).isZero();

    String both =
        ok(
            write(
                patch(taskPath(fx.eventId, taskId)),
                owner,
                "{\"title\":\"함께\",\"assigneeUserId\":\""
                    + fx.ownerId
                    + "\",\"status\":\"CANCELLED\"}",
                "req-both"));
    assertThat(json.readTree(both).get("title").asString()).isEqualTo("함께");
    assertThat(json.readTree(both).get("status").asString()).isEqualTo("CANCELLED");
    assertThat(json.readTree(both).get("version").asInt()).isEqualTo(3);
    assertThat(taskVersion(taskId)).isEqualTo(3);
    assertThat(auditRows(fx.eventId)).isZero();

    problem(
        write(
            patch(taskPath(fx.eventId, taskId)),
            owner,
            "{\"assigneeUserId\":\"" + UUID.randomUUID() + "\"}",
            "req-bad-assignee"),
        400,
        "VALIDATION_FAILED",
        "req-bad-assignee");
    assertThat(assignee(taskId)).isEqualTo(fx.ownerId);
    assertThat(taskVersion(taskId)).isEqualTo(3);
  }

  @Test
  void taskFromAnotherEventIsNotFound() throws Exception {
    Fixture fx = seed("ACTIVE");
    UUID otherEvent = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO events (id, space_id, name, lifecycle_status, lifecycle_version)
        VALUES (?, ?, 'other', 'ACTIVE', 0)
        """,
        otherEvent,
        fx.spaceId);
    UUID taskId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO tasks (id, space_id, event_id, title, status)
        VALUES (?, ?, ?, '다른 행사', 'TODO')
        """,
        taskId,
        fx.spaceId,
        otherEvent);
    Cookie owner = login(fx.ownerId);

    problem(
        read(owner, taskPath(fx.eventId, taskId), "req-other-get"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-other-get");
    problem(
        write(patch(taskPath(fx.eventId, taskId)), owner, "{\"title\":\"바꿈\"}", "req-other-patch"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-other-patch");
    problem(
        delete(taskPath(fx.eventId, taskId))
            .cookie(owner, csrf())
            .header(CSRF_HEADER, CSRF)
            .header("X-Request-Id", "req-other-delete"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-other-delete");
    assertThat(taskTitle(taskId)).isEqualTo("다른 행사");
    problem(
        read(owner, taskPath(fx.eventId, UUID.randomUUID()), "req-missing"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-missing");
  }

  /**
   * Row 23 read half is 200 on GET. Writes, including a same-value patch, stay 409. Invalid status
   * is still 400. ENDED and DRAFT do not block create or a title patch.
   */
  @Test
  void archivedBlocksWritesAndEndedDoesNot() throws Exception {
    Fixture archived = seed("ARCHIVED");
    UUID taskId = task(archived, "안내", "TODO", archived.ownerId);
    UUID itemId = item(archived, taskId, "문구", 1, false);
    Cookie owner = login(archived.ownerId);

    String list = ok(read(owner, tasks(archived.eventId), "req-arch-list"));
    assertThat(json.readTree(list).get("items")).hasSize(1);
    String detail = ok(read(owner, taskPath(archived.eventId, taskId), "req-arch-detail"));
    assertThat(json.readTree(detail).get("status").asString()).isEqualTo("TODO");
    assertThat(json.readTree(detail).get("actions").get("blockedReason").asString())
        .isEqualTo("EVENT_ARCHIVED");

    String create =
        problem(
            write(post(tasks(archived.eventId)), owner, "{\"title\":\"새 업무\"}", "req-arch-create"),
            409,
            "EVENT_ARCHIVED",
            "req-arch-create");
    assertThat(json.readTree(create).get("eventStatus").asString()).isEqualTo("ARCHIVED");
    assertThat(json.readTree(create).has("task")).isFalse();
    assertThat(json.readTree(create).has("outcome")).isFalse();
    assertThat(taskCount(archived.eventId)).isEqualTo(1);

    String same =
        problem(
            write(
                patch(taskPath(archived.eventId, taskId)),
                owner,
                "{\"title\":\"안내\"}",
                "req-arch-same"),
            409,
            "EVENT_ARCHIVED",
            "req-arch-same");
    JsonNode archivedProblem = json.readTree(same);
    assertThat(archivedProblem.get("eventStatus").asString()).isEqualTo("ARCHIVED");
    assertThat(archivedProblem.get("task").has("title")).isFalse();
    assertThat(archivedProblem.get("task").has("outcome")).isFalse();
    assertThat(archivedProblem.get("task").get("status").asString()).isEqualTo("TODO");
    problem(
        write(patch(taskPath(archived.eventId, taskId)), owner, "{}", "req-arch-empty"),
        409,
        "EVENT_ARCHIVED",
        "req-arch-empty");
    problem(
        write(
            patch(taskPath(archived.eventId, taskId)),
            owner,
            "{\"status\":\"CANCELLED\"}",
            "req-arch-cancel"),
        409,
        "EVENT_ARCHIVED",
        "req-arch-cancel");
    problem(
        delete(taskPath(archived.eventId, taskId))
            .cookie(owner, csrf())
            .header(CSRF_HEADER, CSRF)
            .header("X-Request-Id", "req-arch-delete"),
        409,
        "EVENT_ARCHIVED",
        "req-arch-delete");
    problem(
        write(
            patch(taskPath(archived.eventId, taskId)),
            owner,
            "{\"status\":\"DONE\"}",
            "req-arch-done"),
        400,
        "VALIDATION_FAILED",
        "req-arch-done");
    String check =
        problem(
            write(
                put(taskPath(archived.eventId, taskId) + "/items/" + itemId),
                owner,
                "{\"checked\":true}",
                "req-arch-check"),
            409,
            "EVENT_ARCHIVED",
            "req-arch-check");
    assertThat(json.readTree(check).get("eventStatus").asString()).isEqualTo("ARCHIVED");
    assertThat(json.readTree(check).get("task").has("outcome")).isFalse();
    assertThat(taskTitle(taskId)).isEqualTo("안내");
    assertThat(taskStatus(taskId)).isEqualTo("TODO");
    assertThat(taskVersion(taskId)).isZero();
    assertThat(checked(itemId)).isFalse();
    assertThat(itemsOnTask(taskId)).isEqualTo(1);

    Fixture ended = seed("ENDED");
    Cookie endedOwner = login(ended.ownerId);
    String endedCreated =
        created(
            write(
                post(tasks(ended.eventId)),
                endedOwner,
                "{\"title\":\"종료 후\"}",
                "req-ended-create"));
    UUID endedTask = UUID.fromString(json.readTree(endedCreated).get("taskId").asString());
    String endedPatched =
        ok(
            write(
                patch(taskPath(ended.eventId, endedTask)),
                endedOwner,
                "{\"title\":\"종료 수정\"}",
                "req-ended-patch"));
    assertThat(json.readTree(endedPatched).get("title").asString()).isEqualTo("종료 수정");
    assertThat(json.readTree(endedPatched).get("status").asString()).isEqualTo("TODO");
    assertThat(json.readTree(endedPatched).get("version").asInt()).isZero();

    Fixture draft = seed("DRAFT");
    Cookie draftOwner = login(draft.ownerId);
    created(
        write(post(tasks(draft.eventId)), draftOwner, "{\"title\":\"초안\"}", "req-draft-create"));
    assertThat(taskCount(draft.eventId)).isEqualTo(1);
  }

  @Test
  void deleteRemovesItemsAndKeepsAudit() throws Exception {
    Fixture fx = seed("ACTIVE");
    UUID taskId = task(fx, "안내", "TODO", fx.staffId);
    UUID itemId = item(fx, taskId, "문구", 1, false);
    Cookie staff = login(fx.staffId);
    Cookie owner = login(fx.ownerId);
    ok(
        write(
            put(taskPath(fx.eventId, taskId) + "/items/" + itemId),
            staff,
            "{\"checked\":true}",
            "req-check-before-delete"));
    assertThat(auditCount(fx.eventId, "TASK_ITEM_CHECKED")).isEqualTo(1);

    mvc.perform(
            delete(taskPath(fx.eventId, taskId))
                .cookie(owner, csrf())
                .header(CSRF_HEADER, CSRF)
                .header("X-Request-Id", "req-delete"))
        .andExpect(status().isNoContent())
        .andExpect(content().string(""));
    problem(
        read(owner, taskPath(fx.eventId, taskId), "req-after-delete"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-after-delete");
    assertThat(taskCount(fx.eventId)).isZero();
    assertThat(itemsOnTask(taskId)).isZero();
    assertThat(auditActions(fx.eventId)).containsExactly("TASK_ITEM_CHECKED");
  }

  /**
   * The task section confirms no sort field. Proposed assignee and status filters are not applied.
   */
  @Test
  void listUsesChecklistSummaryAndRejectsSort() throws Exception {
    Fixture fx = seed("ACTIVE");
    UUID first = task(fx, "가", "TODO", fx.staffId);
    UUID second = task(fx, "나", "DONE", fx.managerId);
    item(fx, first, "하나", 1, true);
    item(fx, first, "둘", 2, false);
    Cookie owner = login(fx.ownerId);

    String listed =
        ok(read(owner, tasks(fx.eventId) + "?assignee=me&status=TODO&status=DOING", "req-list"));
    JsonNode body = json.readTree(listed);
    assertThat(body.propertyNames()).containsExactly("items", "page");
    assertThat(body.get("page").propertyNames())
        .containsExactly("number", "size", "totalItems", "totalPages");
    assertThat(body.get("page").get("number").asInt()).isZero();
    assertThat(body.get("page").get("size").asInt()).isEqualTo(50);
    assertThat(body.get("page").get("totalItems").asInt()).isEqualTo(2);
    assertThat(body.get("page").get("totalPages").asInt()).isEqualTo(1);
    assertThat(body.get("items")).hasSize(2);
    JsonNode item = body.get("items").get(0);
    assertThat(item.propertyNames())
        .containsExactly(
            "taskId",
            "title",
            "status",
            "assigneeUserId",
            "assigneeDisplayName",
            "checklist",
            "version");
    assertThat(item.get("checklist").propertyNames()).containsExactly("done", "total");
    assertThat(listed).doesNotContain("itemId", "email", "token", "session");
    List<UUID> ordered = orderedIds(fx.eventId);
    String page = ok(read(owner, tasks(fx.eventId) + "?page=0&size=1", "req-page"));
    assertThat(json.readTree(page).get("items").get(0).get("taskId").asString())
        .isEqualTo(ordered.get(0).toString());
    assertThat(json.readTree(page).get("page").get("totalPages").asInt()).isEqualTo(2);
    JsonNode summary = json.readTree(page).get("items").get(0);
    UUID shown = UUID.fromString(summary.get("taskId").asString());
    if (shown.equals(first)) {
      assertThat(summary.get("checklist").get("done").asInt()).isEqualTo(1);
      assertThat(summary.get("checklist").get("total").asInt()).isEqualTo(2);
      assertThat(summary.get("assigneeDisplayName").asString()).isEqualTo("Event Staff");
    }
    String secondPage = ok(read(owner, tasks(fx.eventId) + "?page=1&size=1", "req-page-2"));
    assertThat(json.readTree(secondPage).get("items").get(0).get("taskId").asString())
        .isEqualTo(ordered.get(1).toString());

    problem(
        read(owner, tasks(fx.eventId) + "?size=101", "req-size"),
        400,
        "PAGE_SIZE_EXCEEDED",
        "req-size");
    assertField(
        "sort",
        problem(
            read(owner, tasks(fx.eventId) + "?sort=title,asc", "req-sort"),
            400,
            "VALIDATION_FAILED",
            "req-sort"),
        "sort");
    assertField(
        "page",
        problem(
            read(owner, tasks(fx.eventId) + "?page=-1", "req-page-neg"),
            400,
            "VALIDATION_FAILED",
            "req-page-neg"),
        "page");
    mvc.perform(get(tasks(fx.eventId)).header("X-Request-Id", "req-anon"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
    assertThat(second).isNotNull();
  }

  /** Row 36. Removal already clears assignees. This slice does not rebuild that path. */
  @Test
  void removalStillClearsAssigneesOnTodoDoingAndDone() throws Exception {
    Fixture fx = seed("ACTIVE");
    UUID todo = task(fx, "할 일", "TODO", fx.staffId);
    UUID doing = task(fx, "진행", "DOING", fx.staffId);
    UUID done = task(fx, "완료", "DONE", fx.staffId);
    item(fx, todo, "확인", 1, false);
    item(fx, doing, "확인", 1, true);
    item(fx, done, "확인", 1, true);
    Cookie owner = login(fx.ownerId);

    mvc.perform(
            delete(operators(fx.eventId) + "/" + fx.staffId)
                .cookie(owner, csrf())
                .header(CSRF_HEADER, CSRF))
        .andExpect(status().isOk());

    assertThat(assignee(todo)).isNull();
    assertThat(assignee(doing)).isNull();
    assertThat(assignee(done)).isNull();
    assertThat(taskVersion(todo)).isEqualTo(1);
    assertThat(taskVersion(doing)).isEqualTo(1);
    assertThat(taskVersion(done)).isEqualTo(1);
    assertThat(taskCount(fx.eventId)).isEqualTo(3);
    assertThat(itemsOnEvent(fx.eventId)).isEqualTo(3);
    List<String> details = auditDetails(fx.eventId, AuditActions.TASK_ASSIGNEE_CLEARED);
    assertThat(details).hasSize(3);
    assertThat(details).allMatch(detail -> detail.contains("운영자 제거"));
    assertThat(details).allMatch(detail -> detail.contains(fx.staffId.toString()));

    mvc.perform(
            post(operators(fx.eventId))
                .cookie(owner, csrf())
                .header(CSRF_HEADER, CSRF)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"userId\":\"" + fx.staffId + "\",\"role\":\"STAFF\"}"))
        .andExpect(status().isOk());
    assertThat(assignee(todo)).isNull();
    assertThat(assignee(doing)).isNull();
    assertThat(assignee(done)).isNull();
    assertThat(taskCount(fx.eventId)).isEqualTo(3);
    assertThat(itemsOnEvent(fx.eventId)).isEqualTo(3);
  }

  private String lastProblem;

  private void assertRejectedStatus(
      Fixture fx, Cookie owner, UUID taskId, String status, String unchanged) throws Exception {
    int version = taskVersion(taskId);
    String requestId = "req-" + unchanged + "-" + status;
    problem(
        write(
            patch(taskPath(fx.eventId, taskId)),
            owner,
            "{\"status\":\"" + status + "\"}",
            requestId),
        400,
        "VALIDATION_FAILED",
        requestId);
    assertField(requestId, lastProblem, "status");
    assertThat(taskStatus(taskId)).isEqualTo(unchanged);
    assertThat(taskVersion(taskId)).isEqualTo(version);
  }

  private void assertField(String label, String body, String field) throws Exception {
    JsonNode errors = json.readTree(body).get("errors");
    assertThat(errors).as(label).isNotNull();
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
    lastProblem =
        mvc.perform(request)
            .andExpect(status().is(httpStatus))
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("$.code").value(code))
            .andExpect(jsonPath("$.traceId").value(requestId))
            .andExpect(header().string("X-Request-Id", requestId))
            .andReturn()
            .getResponse()
            .getContentAsString();
    return lastProblem;
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

  private static String tasks(UUID eventId) {
    return "/api/v1/operator/events/" + eventId + "/tasks";
  }

  private static String taskPath(UUID eventId, UUID taskId) {
    return tasks(eventId) + "/" + taskId;
  }

  private static String operators(UUID eventId) {
    return "/api/v1/operator/events/" + eventId + "/operators";
  }

  private Fixture seed(String lifecycle) {
    Fixture fx = Fixture.create();
    user(fx.ownerId, "Event Owner");
    user(fx.managerId, "Event Manager");
    user(fx.staffId, "Event Staff");
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, 'space')", fx.spaceId);
    member(fx.spaceId, fx.ownerId, "OWNER");
    member(fx.spaceId, fx.managerId, "MEMBER");
    member(fx.spaceId, fx.staffId, "MEMBER");
    jdbc.update(
        """
        INSERT INTO events (id, space_id, name, lifecycle_status, lifecycle_version)
        VALUES (?, ?, 'event', ?, 0)
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

  private UUID task(Fixture fx, String title, String status, UUID assignee) {
    UUID taskId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO tasks (id, space_id, event_id, title, status, assignee_user_id)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        taskId,
        fx.spaceId,
        fx.eventId,
        title,
        status,
        assignee);
    return taskId;
  }

  private UUID item(Fixture fx, UUID taskId, String label, int position, boolean checked) {
    UUID itemId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO task_checklist_items
          (id, space_id, event_id, task_id, label, position, checked)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        itemId,
        fx.spaceId,
        fx.eventId,
        taskId,
        label,
        position,
        checked);
    return itemId;
  }

  private String taskStatus(UUID taskId) {
    return jdbc.queryForObject("SELECT status FROM tasks WHERE id = ?", String.class, taskId);
  }

  private String taskTitle(UUID taskId) {
    return jdbc.queryForObject("SELECT title FROM tasks WHERE id = ?", String.class, taskId);
  }

  private int taskVersion(UUID taskId) {
    return jdbc.queryForObject("SELECT version FROM tasks WHERE id = ?", Integer.class, taskId);
  }

  private UUID assignee(UUID taskId) {
    return jdbc.queryForObject(
        "SELECT assignee_user_id FROM tasks WHERE id = ?", UUID.class, taskId);
  }

  private UUID completedBy(UUID taskId) {
    return jdbc.queryForObject(
        "SELECT completed_by_user_id FROM tasks WHERE id = ?", UUID.class, taskId);
  }

  private boolean checked(UUID itemId) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT checked FROM task_checklist_items WHERE id = ?", Boolean.class, itemId));
  }

  private int taskCount(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM tasks WHERE event_id = ?", Integer.class, eventId);
  }

  private int itemsOnTask(UUID taskId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM task_checklist_items WHERE task_id = ?", Integer.class, taskId);
  }

  private int itemsOnEvent(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM task_checklist_items WHERE event_id = ?", Integer.class, eventId);
  }

  private List<UUID> orderedIds(UUID eventId) {
    return jdbc.query(
        "SELECT id FROM tasks WHERE event_id = ? ORDER BY id ASC",
        (rs, row) -> rs.getObject(1, UUID.class),
        eventId);
  }

  private int auditRows(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_logs WHERE event_id = ?", Integer.class, eventId);
  }

  private int auditCount(UUID eventId, String action) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_logs WHERE event_id = ? AND action = ?",
        Integer.class,
        eventId,
        action);
  }

  private List<String> auditActions(UUID eventId) {
    return jdbc.query(
        "SELECT action FROM audit_logs WHERE event_id = ? ORDER BY occurred_at, action",
        (rs, row) -> rs.getString(1),
        eventId);
  }

  private List<String> auditDetails(UUID eventId, String action) {
    return jdbc.query(
        "SELECT detail::text FROM audit_logs WHERE event_id = ? AND action = ?",
        (rs, row) -> rs.getString(1),
        eventId,
        action);
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
