package app.scene.event.task;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
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
 * DEC-062 checklist progress HTTP. Rows 30–35 stay out because {@code PATCH /tasks/{taskId}} is not
 * added. Rows 19 and 23 do not call a task read: this slice does not add {@code GET /tasks}.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class TaskProgressHttpIT {

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

  /** Rows 1, 2, 5, 7, 8, 12, 14, 15, 28, and 29. The header is ignored, not rejected. */
  @Test
  void checkCompleteAndReopenReportStateAndAuditTheChange() throws Exception {
    Fixture fx = seed("ACTIVE");
    UUID taskId = task(fx, "안내", "TODO", fx.staffId);
    UUID first = item(fx, taskId, "문구", 1, false);
    UUID second = item(fx, taskId, "동선", 2, false);
    Cookie staff = login(fx.staffId);

    String checked =
        ok(
            item(staff, fx.eventId, taskId, first, "{\"checked\":true}", "req-check")
                .header("Idempotency-Key", "retry-1"));
    JsonNode body = json.readTree(checked);
    assertThat(body.propertyNames())
        .containsExactly(
            "taskId",
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
    assertThat(body.get("outcome").asString()).isEqualTo("UPDATED");
    assertThat(body.get("status").asString()).isEqualTo("DOING");
    assertThat(body.get("version").asInt()).isEqualTo(1);
    assertThat(body.get("assigneeUserId").asString()).isEqualTo(fx.staffId.toString());
    assertThat(body.get("assigneeDisplayName").asString()).isEqualTo("Event Staff");
    assertThat(body.get("completedByUserId").isNull()).isTrue();
    assertThat(body.get("completedAt").isNull()).isTrue();
    assertThat(body.get("checklist").get("done").asInt()).isEqualTo(1);
    assertThat(body.get("checklist").get("total").asInt()).isEqualTo(2);
    JsonNode item = body.get("checklist").get("items").get(0);
    assertThat(item.propertyNames())
        .containsExactly(
            "itemId",
            "label",
            "position",
            "checked",
            "checkedByUserId",
            "checkedByDisplayName",
            "checkedAt");
    assertThat(item.get("checkedByUserId").asString()).isEqualTo(fx.staffId.toString());
    assertThat(item.get("checkedByDisplayName").asString()).isEqualTo("Event Staff");
    assertThat(item.get("checkedAt").isNull()).isFalse();
    assertThat(body.get("actions").get("canCheck").asBoolean()).isTrue();
    assertThat(body.get("actions").get("canComplete").asBoolean()).isFalse();
    assertThat(body.get("actions").get("blockedReason").asString())
        .isEqualTo("CHECKLIST_INCOMPLETE");
    assertThat(checked).doesNotContain("email", "token", "session");
    assertThat(taskStatus(taskId)).isEqualTo("DOING");
    assertThat(taskVersion(taskId)).isEqualTo(1);
    assertThat(auditCount(fx, "TASK_ITEM_CHECKED")).isEqualTo(1);
    JsonNode audit = json.readTree(auditDetail(fx, "TASK_ITEM_CHECKED"));
    assertThat(audit.get("before").get("checked").asBoolean()).isFalse();
    assertThat(audit.get("before").get("status").asString()).isEqualTo("TODO");
    assertThat(audit.get("before").get("version").asInt()).isZero();
    assertThat(audit.get("after").get("checked").asBoolean()).isTrue();
    assertThat(audit.get("after").get("status").asString()).isEqualTo("DOING");
    assertThat(audit.get("after").get("version").asInt()).isEqualTo(1);
    assertThat(auditActor(fx, "TASK_ITEM_CHECKED")).isEqualTo(fx.staffId);

    String again = ok(item(staff, fx.eventId, taskId, first, "{\"checked\":true}", "req-again"));
    JsonNode noChange = json.readTree(again);
    assertThat(noChange.get("outcome").asString()).isEqualTo("NO_CHANGE");
    assertThat(noChange.get("version").asInt()).isEqualTo(1);
    assertThat(noChange.get("checklist").get("items").get(0).get("checkedAt").asString())
        .isEqualTo(item.get("checkedAt").asString());
    assertThat(auditCount(fx, "TASK_ITEM_CHECKED")).isEqualTo(1);
    assertThat(auditCount(fx, "TASK_ITEM_UNCHECKED")).isZero();

    String stale =
        problem(
            complete(staff, fx.eventId, taskId, "{\"version\":0}", "req-stale"),
            409,
            "TASK_VERSION_CONFLICT",
            "req-stale");
    JsonNode conflict = json.readTree(stale);
    assertThat(conflict.get("task").has("outcome")).isFalse();
    assertThat(conflict.get("task").get("version").asInt()).isEqualTo(1);
    assertThat(conflict.get("task").get("checklist").get("done").asInt()).isEqualTo(1);
    assertThat(stale).doesNotContain("email", "token", "session", "ALREADY_DONE");
    assertThat(taskVersion(taskId)).isEqualTo(1);

    String incomplete =
        problem(
            complete(staff, fx.eventId, taskId, "{\"version\":1}", "req-incomplete"),
            409,
            "INVALID_TASK_STATE",
            "req-incomplete");
    assertThat(json.readTree(incomplete).get("reason").asString())
        .isEqualTo("CHECKLIST_INCOMPLETE");
    assertThat(json.readTree(incomplete).get("task").get("status").asString()).isEqualTo("DOING");
    assertThat(taskStatus(taskId)).isEqualTo("DOING");

    String cleared = ok(item(staff, fx.eventId, taskId, first, "{\"checked\":false}", "req-clear"));
    assertThat(json.readTree(cleared).get("status").asString()).isEqualTo("DOING");
    assertThat(json.readTree(cleared).get("checklist").get("done").asInt()).isZero();
    assertThat(taskStatus(taskId)).isEqualTo("DOING");

    ok(item(staff, fx.eventId, taskId, first, "{\"checked\":true}", "req-first"));
    ok(item(staff, fx.eventId, taskId, second, "{\"checked\":true}", "req-second"));
    int ready = taskVersion(taskId);
    String completed =
        ok(complete(staff, fx.eventId, taskId, "{\"version\":" + ready + "}", "req-done"));
    JsonNode done = json.readTree(completed);
    assertThat(done.get("outcome").asString()).isEqualTo("COMPLETED");
    assertThat(done.get("status").asString()).isEqualTo("DONE");
    assertThat(done.get("completedByUserId").asString()).isEqualTo(fx.staffId.toString());
    assertThat(done.get("completedByDisplayName").asString()).isEqualTo("Event Staff");
    assertThat(done.get("completedAt").isNull()).isFalse();
    assertThat(done.get("actions").get("canReopen").asBoolean()).isTrue();
    assertThat(done.get("actions").get("blockedReason").asString()).isEqualTo("TASK_DONE");
    assertThat(done.get("checklist").get("done").asInt()).isEqualTo(2);
    assertThat(auditCount(fx, "TASK_COMPLETED")).isEqualTo(1);
    assertThat(auditActor(fx, "TASK_COMPLETED")).isEqualTo(fx.staffId);

    String lost =
        ok(complete(staff, fx.eventId, taskId, "{\"version\":" + ready + "}", "req-lost"));
    assertThat(json.readTree(lost).get("outcome").asString()).isEqualTo("ALREADY_DONE");
    assertThat(json.readTree(lost).get("version").asInt()).isEqualTo(taskVersion(taskId));
    assertThat(auditCount(fx, "TASK_COMPLETED")).isEqualTo(1);

    int doneVersion = taskVersion(taskId);
    String reopened =
        ok(
            reopen(
                staff,
                fx.eventId,
                taskId,
                "{\"version\":" + doneVersion + ",\"reason\":\"로비 표지 위치 변경\"}",
                "req-reopen"));
    JsonNode open = json.readTree(reopened);
    assertThat(open.get("outcome").asString()).isEqualTo("REOPENED");
    assertThat(open.get("status").asString()).isEqualTo("DOING");
    assertThat(open.get("completedByUserId").isNull()).isTrue();
    assertThat(open.get("checklist").get("done").asInt()).isEqualTo(2);
    assertThat(open.get("actions").get("canComplete").asBoolean()).isTrue();
    assertThat(open.get("actions").get("blockedReason").isNull()).isTrue();
    JsonNode reopenAudit = json.readTree(auditDetail(fx, "TASK_REOPENED"));
    assertThat(reopenAudit.get("reason").asString()).isEqualTo("로비 표지 위치 변경");
    assertThat(reopenAudit.get("before").get("status").asString()).isEqualTo("DONE");
    assertThat(reopenAudit.get("after").get("status").asString()).isEqualTo("DOING");
    assertThat(auditActor(fx, "TASK_REOPENED")).isEqualTo(fx.staffId);

    String already = ok(reopen(staff, fx.eventId, taskId, "{\"version\":0}", "req-open"));
    assertThat(json.readTree(already).get("outcome").asString()).isEqualTo("ALREADY_OPEN");
    assertThat(json.readTree(already).get("version").asInt()).isEqualTo(taskVersion(taskId));
    assertThat(auditCount(fx, "TASK_REOPENED")).isEqualTo(1);
  }

  /** Row 16. A bad body is still 403 for a caller who cannot write. */
  @Test
  void staffWithoutTaskWriteCannotCheckAnotherTask() throws Exception {
    Fixture fx = seed("ACTIVE");
    UUID taskId = task(fx, "남의 업무", "TODO", fx.managerId);
    UUID itemId = item(fx, taskId, "확인", 1, false);
    Cookie staff = login(fx.staffId);

    problem(
        item(staff, fx.eventId, taskId, itemId, "{}", "req-empty"), 403, "FORBIDDEN", "req-empty");
    problem(
        item(staff, fx.eventId, taskId, itemId, "{\"checked\":true}", "req-staff"),
        403,
        "FORBIDDEN",
        "req-staff");
    assertThat(taskStatus(taskId)).isEqualTo("TODO");
    assertThat(taskVersion(taskId)).isZero();
    assertThat(checked(itemId)).isFalse();
    assertThat(auditCount(fx, "TASK_ITEM_CHECKED")).isZero();
  }

  /** Row 17. */
  @Test
  void grantedStaffCanCheckAnotherPersonsTask() throws Exception {
    Fixture fx = seed("ACTIVE");
    UUID taskId = task(fx, "매니저 업무", "TODO", fx.managerId);
    UUID itemId = item(fx, taskId, "확인", 1, false);
    Cookie owner = login(fx.ownerId);
    Cookie staff = login(fx.staffId);
    problem(
        item(staff, fx.eventId, taskId, itemId, "{\"checked\":true}", "req-before"),
        403,
        "FORBIDDEN",
        "req-before");

    mvc.perform(
            put(permissions(fx.eventId, fx.staffId))
                .cookie(owner, csrf())
                .header(CSRF_HEADER, CSRF)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"grants\":[\"TASK_WRITE\"],\"revokes\":[]}"))
        .andExpect(status().isOk());

    String checked = ok(item(staff, fx.eventId, taskId, itemId, "{\"checked\":true}", "req-grant"));
    assertThat(json.readTree(checked).get("outcome").asString()).isEqualTo("UPDATED");
    assertThat(json.readTree(checked).get("status").asString()).isEqualTo("DOING");
    assertThat(checked(itemId)).isTrue();
    assertThat(auditActor(fx, "TASK_ITEM_CHECKED")).isEqualTo(fx.staffId);
  }

  /** Row 18. */
  @Test
  void revokedManagerCompletesOnlyAnAssignedTask() throws Exception {
    Fixture fx = seed("ACTIVE");
    UUID other = task(fx, "스태프 업무", "DOING", fx.staffId);
    item(fx, other, "확인", 1, true);
    UUID own = task(fx, "내 업무", "TODO", fx.managerId);
    UUID ownItem = item(fx, own, "확인", 1, false);
    Cookie owner = login(fx.ownerId);
    Cookie manager = login(fx.managerId);
    mvc.perform(
            put(permissions(fx.eventId, fx.managerId))
                .cookie(owner, csrf())
                .header(CSRF_HEADER, CSRF)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"grants\":[],\"revokes\":[\"TASK_WRITE\"]}"))
        .andExpect(status().isOk());

    problem(
        complete(manager, fx.eventId, other, "{\"version\":0}", "req-other"),
        403,
        "FORBIDDEN",
        "req-other");
    assertThat(taskStatus(other)).isEqualTo("DOING");
    assertThat(taskVersion(other)).isZero();

    ok(item(manager, fx.eventId, own, ownItem, "{\"checked\":true}", "req-own-check"));
    String completed = ok(complete(manager, fx.eventId, own, "{\"version\":1}", "req-own-done"));
    assertThat(json.readTree(completed).get("outcome").asString()).isEqualTo("COMPLETED");
    assertThat(taskStatus(own)).isEqualTo("DONE");
    assertThat(auditActor(fx, "TASK_COMPLETED")).isEqualTo(fx.managerId);
  }

  /** Row 19. The read half stays out: no task GET is added. */
  @Test
  void spaceAdminWhoIsNotAnOperatorCannotCheck() throws Exception {
    Fixture fx = seed("ACTIVE");
    UUID taskId = task(fx, "업무", "TODO", fx.staffId);
    UUID itemId = item(fx, taskId, "확인", 1, false);
    UUID adminId = user("Space Admin");
    member(fx.spaceId, adminId, "ADMIN");

    String body =
        problem(
            item(login(adminId), fx.eventId, taskId, itemId, "{\"checked\":true}", "req-admin"),
            403,
            "FORBIDDEN",
            "req-admin");
    assertThat(json.readTree(body).has("task")).isFalse();
    assertThat(taskStatus(taskId)).isEqualTo("TODO");
    assertThat(checked(itemId)).isFalse();
  }

  /** Row 20. */
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
    UUID itemId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO task_checklist_items (id, space_id, event_id, task_id, label, position)
        VALUES (?, ?, ?, ?, '확인', 1)
        """,
        itemId,
        fx.spaceId,
        otherEvent,
        taskId);

    String body =
        problem(
            item(login(fx.ownerId), fx.eventId, taskId, itemId, "{\"checked\":true}", "req-other"),
            404,
            "RESOURCE_NOT_FOUND",
            "req-other");
    assertThat(json.readTree(body).has("task")).isFalse();
    assertThat(taskStatus(taskId)).isEqualTo("TODO");
  }

  /** Rows 21 and 22. There is no task kind, so the titles stand in for the two cases. */
  @Test
  void endedEventAllowsFollowUpAndOtherTasks() throws Exception {
    Fixture fx = seed("ENDED");
    Cookie staff = login(fx.staffId);
    progressOnEnded(fx, staff, "후속 업무", "follow-up");
    progressOnEnded(fx, staff, "현장 업무", "onsite");
  }

  /** Rows 23, 24, and 41. A repeated value and an old complete are archived, not already done. */
  @Test
  void archivedEventRejectsEveryWriteIncludingARepeat() throws Exception {
    Fixture fx = seed("ACTIVE");
    UUID taskId = task(fx, "업무", "TODO", fx.staffId);
    UUID openItem = item(fx, taskId, "미체크", 1, false);
    UUID sameItem = item(fx, taskId, "체크", 2, true);
    jdbc.update("UPDATE events SET lifecycle_status = 'ARCHIVED' WHERE id = ?", fx.eventId);
    Cookie staff = login(fx.staffId);

    String changed =
        problem(
            item(staff, fx.eventId, taskId, openItem, "{\"checked\":true}", "req-arch-check"),
            409,
            "EVENT_ARCHIVED",
            "req-arch-check");
    JsonNode archived = json.readTree(changed);
    assertThat(archived.get("eventStatus").asString()).isEqualTo("ARCHIVED");
    assertThat(archived.get("task").has("outcome")).isFalse();
    assertThat(archived.get("task").get("status").asString()).isEqualTo("TODO");
    assertThat(archived.get("task").get("actions").get("blockedReason").asString())
        .isEqualTo("EVENT_ARCHIVED");
    assertThat(changed).doesNotContain("email", "token", "session");
    assertThat(checked(openItem)).isFalse();
    assertThat(taskVersion(taskId)).isZero();

    problem(
        item(staff, fx.eventId, taskId, sameItem, "{\"checked\":true}", "req-arch-same"),
        409,
        "EVENT_ARCHIVED",
        "req-arch-same");
    problem(
        complete(staff, fx.eventId, taskId, "{\"version\":0}", "req-arch-done"),
        409,
        "EVENT_ARCHIVED",
        "req-arch-done");
    problem(
        reopen(staff, fx.eventId, taskId, "{\"version\":0}", "req-arch-reopen"),
        409,
        "EVENT_ARCHIVED",
        "req-arch-reopen");
    assertThat(taskStatus(taskId)).isEqualTo("TODO");
    assertThat(taskVersion(taskId)).isZero();
    assertThat(auditCount(fx, "TASK_ITEM_CHECKED")).isZero();
    assertThat(auditCount(fx, "TASK_COMPLETED")).isZero();
    assertThat(auditCount(fx, "TASK_REOPENED")).isZero();

    jdbc.update("UPDATE tasks SET status = 'DONE', version = 5 WHERE id = ?", taskId);
    String repeated =
        problem(
            complete(staff, fx.eventId, taskId, "{\"version\":1}", "req-arch-old"),
            409,
            "EVENT_ARCHIVED",
            "req-arch-old");
    assertThat(repeated).doesNotContain("ALREADY_DONE");
    assertThat(json.readTree(repeated).get("task").get("status").asString()).isEqualTo("DONE");
    assertThat(json.readTree(repeated).get("task").get("version").asInt()).isEqualTo(5);
    assertThat(taskStatus(taskId)).isEqualTo("DONE");
    assertThat(taskVersion(taskId)).isEqualTo(5);
  }

  /** Row 25. The same session is judged again after the operator row is removed. */
  @Test
  void revokedSessionCannotCheck() throws Exception {
    Fixture fx = seed("ACTIVE");
    UUID taskId = task(fx, "업무", "TODO", fx.staffId);
    UUID itemId = item(fx, taskId, "확인", 1, false);
    Cookie staff = login(fx.staffId);
    mvc.perform(
            delete(operators(fx.eventId) + "/" + fx.staffId)
                .cookie(login(fx.ownerId), csrf())
                .header(CSRF_HEADER, CSRF))
        .andExpect(status().isOk());

    problem(
        item(staff, fx.eventId, taskId, itemId, "{\"checked\":true}", "req-revoked"),
        403,
        "NOT_A_MEMBER",
        "req-revoked");
    assertThat(checked(itemId)).isFalse();
    assertThat(auditCount(fx, "TASK_ITEM_CHECKED")).isZero();
  }

  /** Row 26, plus a 501-character reopen reason. */
  @Test
  void missingAndOversizedValuesFailValidation() throws Exception {
    Fixture fx = seed("ACTIVE");
    UUID taskId = task(fx, "업무", "TODO", fx.ownerId);
    UUID itemId = item(fx, taskId, "확인", 1, false);
    Cookie owner = login(fx.ownerId);

    String missingChecked =
        problem(
            item(owner, fx.eventId, taskId, itemId, "{}", "req-checked"),
            400,
            "VALIDATION_FAILED",
            "req-checked");
    assertThat(json.readTree(missingChecked).get("errors").get(0).get("field").asString())
        .isEqualTo("checked");
    String badChecked =
        problem(
            item(owner, fx.eventId, taskId, itemId, "{\"checked\":\"yes\"}", "req-type"),
            400,
            "VALIDATION_FAILED",
            "req-type");
    assertThat(json.readTree(badChecked).get("errors").get(0).get("field").asString())
        .isEqualTo("checked");
    String missingVersion =
        problem(
            complete(owner, fx.eventId, taskId, "{}", "req-version"),
            400,
            "VALIDATION_FAILED",
            "req-version");
    assertThat(json.readTree(missingVersion).get("errors").get(0).get("field").asString())
        .isEqualTo("version");
    String longReason =
        problem(
            reopen(
                owner,
                fx.eventId,
                taskId,
                "{\"version\":0,\"reason\":\"" + "a".repeat(501) + "\"}",
                "req-reason"),
            400,
            "VALIDATION_FAILED",
            "req-reason");
    assertThat(json.readTree(longReason).get("errors").get(0).get("field").asString())
        .isEqualTo("reason");
    assertThat(taskStatus(taskId)).isEqualTo("TODO");
    assertThat(taskVersion(taskId)).isZero();
    assertThat(auditRows(fx)).isZero();

    jdbc.update("UPDATE tasks SET status = 'DONE' WHERE id = ?", taskId);
    String accepted =
        ok(
            reopen(
                owner,
                fx.eventId,
                taskId,
                "{\"version\":0,\"reason\":\"" + "b".repeat(500) + "\"}",
                "req-500"));
    assertThat(json.readTree(accepted).get("outcome").asString()).isEqualTo("REOPENED");
    assertThat(json.readTree(auditDetail(fx, "TASK_REOPENED")).get("reason").asString())
        .hasSize(500);
  }

  /** Row 27. A removed item does not attach the task. */
  @Test
  void removedChecklistItemIsNotFound() throws Exception {
    Fixture fx = seed("ACTIVE");
    UUID taskId = task(fx, "업무", "TODO", fx.ownerId);
    UUID itemId = item(fx, taskId, "확인", 1, false);
    jdbc.update("DELETE FROM task_checklist_items WHERE id = ?", itemId);

    String body =
        problem(
            item(login(fx.ownerId), fx.eventId, taskId, itemId, "{\"checked\":true}", "req-item"),
            404,
            "RESOURCE_NOT_FOUND",
            "req-item");
    assertThat(json.readTree(body).has("task")).isFalse();
    assertThat(taskVersion(taskId)).isZero();
    assertThat(auditRows(fx)).isZero();
  }

  /** Row 40. */
  @Test
  void cancelledCompleteAndReopenFollowTheVersionOrder() throws Exception {
    Fixture fx = seed("ACTIVE");
    UUID taskId = task(fx, "취소", "TODO", fx.ownerId);
    jdbc.update("UPDATE tasks SET status = 'CANCELLED', version = 2 WHERE id = ?", taskId);
    Cookie owner = login(fx.ownerId);

    String current =
        problem(
            complete(owner, fx.eventId, taskId, "{\"version\":2}", "req-cancel"),
            409,
            "INVALID_TASK_STATE",
            "req-cancel");
    assertThat(json.readTree(current).get("reason").asString()).isEqualTo("TASK_CANCELLED");
    assertThat(json.readTree(current).get("task").get("status").asString()).isEqualTo("CANCELLED");
    assertThat(json.readTree(current).get("task").has("outcome")).isFalse();
    String stale =
        problem(
            complete(owner, fx.eventId, taskId, "{\"version\":1}", "req-cancel-stale"),
            409,
            "TASK_VERSION_CONFLICT",
            "req-cancel-stale");
    assertThat(json.readTree(stale).has("reason")).isFalse();
    assertThat(json.readTree(stale).get("task").get("version").asInt()).isEqualTo(2);
    problem(
        reopen(owner, fx.eventId, taskId, "{\"version\":2}", "req-cancel-reopen"),
        409,
        "INVALID_TASK_STATE",
        "req-cancel-reopen");
    problem(
        reopen(owner, fx.eventId, taskId, "{\"version\":0}", "req-cancel-reopen-stale"),
        409,
        "TASK_VERSION_CONFLICT",
        "req-cancel-reopen-stale");
    assertThat(taskStatus(taskId)).isEqualTo("CANCELLED");
    assertThat(taskVersion(taskId)).isEqualTo(2);
    assertThat(auditCount(fx, "TASK_COMPLETED")).isZero();
    assertThat(auditCount(fx, "TASK_REOPENED")).isZero();
  }

  /** Row 36. Removal already clears assignees. Re-adding the operator does not assign them back. */
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
    assertThat(itemCount(fx)).isEqualTo(3);
    List<String> details = auditDetails(fx, AuditActions.TASK_ASSIGNEE_CLEARED);
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
    assertThat(itemCount(fx)).isEqualTo(3);
  }

  private void progressOnEnded(Fixture fx, Cookie staff, String title, String slug)
      throws Exception {
    UUID taskId = task(fx, title, "TODO", fx.staffId);
    UUID itemId = item(fx, taskId, "확인", 1, false);
    String checked =
        ok(item(staff, fx.eventId, taskId, itemId, "{\"checked\":true}", "req-" + slug + "-check"));
    assertThat(json.readTree(checked).get("outcome").asString()).isEqualTo("UPDATED");
    String completed =
        ok(complete(staff, fx.eventId, taskId, "{\"version\":1}", "req-" + slug + "-done"));
    assertThat(json.readTree(completed).get("outcome").asString()).isEqualTo("COMPLETED");
    String reopened =
        ok(reopen(staff, fx.eventId, taskId, "{\"version\":2}", "req-" + slug + "-reopen"));
    assertThat(json.readTree(reopened).get("outcome").asString()).isEqualTo("REOPENED");
    assertThat(json.readTree(reopened).get("status").asString()).isEqualTo("DOING");
    assertThat(taskStatus(taskId)).isEqualTo("DOING");
  }

  private MockHttpServletRequestBuilder item(
      Cookie session, UUID eventId, UUID taskId, UUID itemId, String body, String requestId) {
    return write(
        put("/api/v1/operator/events/" + eventId + "/tasks/" + taskId + "/items/" + itemId),
        session,
        body,
        requestId);
  }

  private MockHttpServletRequestBuilder complete(
      Cookie session, UUID eventId, UUID taskId, String body, String requestId) {
    return write(
        post("/api/v1/operator/events/" + eventId + "/tasks/" + taskId + "/complete"),
        session,
        body,
        requestId);
  }

  private MockHttpServletRequestBuilder reopen(
      Cookie session, UUID eventId, UUID taskId, String body, String requestId) {
    return write(
        post("/api/v1/operator/events/" + eventId + "/tasks/" + taskId + "/reopen"),
        session,
        body,
        requestId);
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

  private static String operators(UUID eventId) {
    return "/api/v1/operator/events/" + eventId + "/operators";
  }

  private static String permissions(UUID eventId, UUID userId) {
    return operators(eventId) + "/" + userId + "/permissions";
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

  private int taskVersion(UUID taskId) {
    return jdbc.queryForObject("SELECT version FROM tasks WHERE id = ?", Integer.class, taskId);
  }

  private UUID assignee(UUID taskId) {
    return jdbc.queryForObject(
        "SELECT assignee_user_id FROM tasks WHERE id = ?", UUID.class, taskId);
  }

  private boolean checked(UUID itemId) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT checked FROM task_checklist_items WHERE id = ?", Boolean.class, itemId));
  }

  private int itemCount(Fixture fx) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM task_checklist_items WHERE event_id = ?", Integer.class, fx.eventId);
  }

  private int auditRows(Fixture fx) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_logs WHERE event_id = ?", Integer.class, fx.eventId);
  }

  private int auditCount(Fixture fx, String action) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_logs WHERE event_id = ? AND action = ?",
        Integer.class,
        fx.eventId,
        action);
  }

  private String auditDetail(Fixture fx, String action) {
    return jdbc.queryForObject(
        "SELECT detail::text FROM audit_logs WHERE event_id = ? AND action = ?",
        String.class,
        fx.eventId,
        action);
  }

  private List<String> auditDetails(Fixture fx, String action) {
    return jdbc.query(
        "SELECT detail::text FROM audit_logs WHERE event_id = ? AND action = ?",
        (rs, row) -> rs.getString(1),
        fx.eventId,
        action);
  }

  private UUID auditActor(Fixture fx, String action) {
    return jdbc.queryForObject(
        "SELECT actor_user_id FROM audit_logs WHERE event_id = ? AND action = ?",
        UUID.class,
        fx.eventId,
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
