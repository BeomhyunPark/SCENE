package app.scene.event;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.web.RequestIdFilter;
import app.scene.support.PostgresTestcontainer;
import jakarta.servlet.http.Cookie;
import java.time.LocalDate;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;
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
 * Event create, list, and name patch. An active member opens the event and becomes its owner. The
 * space-path probe stays 404, then NOT_A_MEMBER, then FORBIDDEN.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class EventCommandHttpIT {

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

  @Test
  void activeMemberCreatesADraftTheyOwn() throws Exception {
    UUID spaceId = space("Home");
    UUID memberId = user("Member");
    member(spaceId, memberId, "MEMBER");
    Cookie member = login(memberId);
    assertThat(eventCount(spaceId)).isZero();

    String created =
        created(
            write(post(events(spaceId)), member, "{\"name\":\"  여름 수련회  \"}", "req-create")
                .header("Idempotency-Key", "same-key"));
    JsonNode body = json.readTree(created);
    assertThat(body.propertyNames()).containsExactly(detailKeys());
    assertThat(body.get("startDate").isNull()).isTrue();
    assertThat(body.get("endDate").isNull()).isTrue();
    assertThat(body.get("place").isNull()).isTrue();
    assertThat(body.get("eventType").isNull()).isTrue();
    UUID eventId = UUID.fromString(body.get("eventId").asString());
    assertThat(body.get("name").asString()).isEqualTo("여름 수련회");
    assertThat(body.get("lifecycleStatus").asString()).isEqualTo("DRAFT");
    assertThat(body.get("lifecycleVersion").asInt()).isZero();
    assertThat(created).doesNotContain("startsAt", "endsAt", "timezone", "spaceId");
    assertThat(storedName(eventId)).isEqualTo("여름 수련회");
    assertThat(storedStatus(eventId)).isEqualTo("DRAFT");
    assertThat(storedVersion(eventId)).isZero();
    assertThat(eventRole(eventId, memberId)).isEqualTo("OWNER");
    assertThat(permissionCount(eventId)).isZero();
    assertThat(auditCount(eventId)).isZero();

    String again =
        created(
            write(post(events(spaceId)), member, "{\"name\":\"둘째\"}", "req-create-2")
                .header("Idempotency-Key", "same-key"));
    assertThat(json.readTree(again).get("eventId").asString()).isNotEqualTo(eventId.toString());
    assertThat(eventCount(spaceId)).isEqualTo(2);

    UUID leaverId = user("Left");
    member(spaceId, leaverId, "MEMBER");
    jdbc.update(
        "UPDATE members SET status = 'LEFT' WHERE space_id = ? AND user_id = ?", spaceId, leaverId);
    int beforeLeave = eventCount(spaceId);
    problem(
        write(post(events(spaceId)), login(leaverId), "{\"name\":\"떠난 뒤\"}", "req-left"),
        403,
        "NOT_A_MEMBER",
        "req-left");
    assertThat(eventCount(spaceId)).isEqualTo(beforeLeave);

    UUID unknown = UUID.randomUUID();
    problem(
        write(post(events(unknown)), member, "{\"name\":\"없는 공간\"}", "req-missing-space"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-missing-space");
    assertThat(eventCount(unknown)).isZero();

    UUID stranger = user("Stranger");
    problem(
        write(post(events(spaceId)), login(stranger), "{\"name\":\"행 없음\"}", "req-no-member"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-no-member");
    assertThat(eventCount(spaceId)).isEqualTo(beforeLeave);

    assertRejectedCreate(member, spaceId, "{}", "name", "req-blank-object");
    assertRejectedCreate(member, spaceId, "{\"name\":\"   \"}", "name", "req-blank");
    assertRejectedCreate(member, spaceId, "{\"name\":null}", "name", "req-null");
    assertRejectedCreate(
        member, spaceId, "{\"name\":\"" + "가".repeat(201) + "\"}", "name", "req-long");
    assertRejectedCreate(
        member,
        spaceId,
        "{\"name\":\"상태\",\"lifecycleStatus\":\"ACTIVE\"}",
        "lifecycleStatus",
        "req-status");
    assertRejectedCreate(
        member, spaceId, "{\"name\":\"기간\",\"startsAt\":\"2026-10-08\"}", "startsAt", "req-start");
    assertRejectedCreate(
        member, spaceId, "{\"name\":\"기간\",\"endsAt\":\"2026-10-09\"}", "endsAt", "req-end");
    assertRejectedCreate(
        member, spaceId, "{\"name\":\"시간\",\"timezone\":\"Asia/Seoul\"}", "timezone", "req-zone");
    assertThat(eventCount(spaceId)).isEqualTo(beforeLeave);
    assertThat(storedStatus(eventId)).isEqualTo("DRAFT");
  }

  @Test
  void memberListsOnlyOperatedEventsAndAnAdminListsBoth() throws Exception {
    UUID spaceId = space("Home");
    UUID ownerId = user("Space Owner");
    UUID adminId = user("Space Admin");
    UUID memberId = user("Member");
    member(spaceId, ownerId, "OWNER");
    member(spaceId, adminId, "ADMIN");
    member(spaceId, memberId, "MEMBER");
    Cookie member = login(memberId);
    Cookie admin = login(adminId);
    Cookie owner = login(ownerId);

    String created =
        created(write(post(events(spaceId)), member, "{\"name\":\"Alpha\"}", "req-alpha"));
    UUID alpha = UUID.fromString(json.readTree(created).get("eventId").asString());
    UUID beta = event(spaceId, "Beta", "ACTIVE", 4);
    operator(spaceId, beta, adminId, "STAFF");
    assertThat(eventRole(alpha, ownerId)).isNull();
    assertThat(eventRole(beta, memberId)).isNull();

    String memberList = ok(read(member, events(spaceId), "req-member-list"));
    JsonNode memberBody = json.readTree(memberList);
    assertThat(memberBody.propertyNames()).containsExactly("items", "page");
    assertThat(memberBody.get("page").propertyNames())
        .containsExactly("number", "size", "totalItems", "totalPages");
    assertThat(memberBody.get("page").get("number").asInt()).isZero();
    assertThat(memberBody.get("page").get("size").asInt()).isEqualTo(50);
    assertThat(memberBody.get("page").get("totalItems").asInt()).isEqualTo(1);
    assertThat(memberBody.get("page").get("totalPages").asInt()).isEqualTo(1);
    assertThat(memberBody.get("items")).hasSize(1);
    JsonNode item = memberBody.get("items").get(0);
    assertThat(item.propertyNames()).containsExactly(listKeys());
    assertThat(item.get("startDate").isNull()).isTrue();
    assertThat(item.get("endDate").isNull()).isTrue();
    assertThat(item.get("place").isNull()).isTrue();
    assertThat(item.get("eventType").isNull()).isTrue();
    assertThat(item.get("eventId").asString()).isEqualTo(alpha.toString());
    assertThat(item.get("name").asString()).isEqualTo("Alpha");
    assertThat(item.get("lifecycleStatus").asString()).isEqualTo("DRAFT");
    assertThat(memberList).doesNotContain("Beta", "lifecycleVersion", "startsAt", "email");

    String adminList = ok(read(admin, events(spaceId), "req-admin-list"));
    JsonNode adminItems = json.readTree(adminList).get("items");
    assertThat(adminItems).hasSize(2);
    assertThat(adminItems.get(0).get("name").asString()).isEqualTo("Alpha");
    assertThat(adminItems.get(1).get("name").asString()).isEqualTo("Beta");
    assertThat(json.readTree(adminList).get("page").get("totalItems").asInt()).isEqualTo(2);

    String ownerList = ok(read(owner, events(spaceId) + "?page=0&size=1", "req-owner-page"));
    JsonNode ownerBody = json.readTree(ownerList);
    assertThat(ownerBody.get("items")).hasSize(1);
    assertThat(ownerBody.get("items").get(0).get("eventId").asString()).isEqualTo(alpha.toString());
    assertThat(ownerBody.get("page").get("totalItems").asInt()).isEqualTo(2);
    assertThat(ownerBody.get("page").get("totalPages").asInt()).isEqualTo(2);
    String ownerNext = ok(read(owner, events(spaceId) + "?page=1&size=1", "req-owner-page-2"));
    assertThat(json.readTree(ownerNext).get("items").get(0).get("eventId").asString())
        .isEqualTo(beta.toString());

    problem(
        read(member, events(spaceId) + "?size=101", "req-size"),
        400,
        "PAGE_SIZE_EXCEEDED",
        "req-size");
    assertField(
        "sort",
        problem(
            read(member, events(spaceId) + "?sort=name,asc", "req-sort"),
            400,
            "VALIDATION_FAILED",
            "req-sort"),
        "sort");

    String detail = ok(read(member, eventPath(alpha), "req-detail"));
    JsonNode detailBody = json.readTree(detail);
    assertThat(detailBody.propertyNames()).containsExactly(detailKeys());
    assertThat(detailBody.get("lifecycleVersion").asInt()).isZero();
    String adminRead = ok(read(admin, eventPath(alpha), "req-admin-read"));
    assertThat(json.readTree(adminRead).get("name").asString()).isEqualTo("Alpha");
    String ownerRead = ok(read(owner, eventPath(beta), "req-owner-read"));
    assertThat(json.readTree(ownerRead).get("lifecycleStatus").asString()).isEqualTo("ACTIVE");
    assertThat(json.readTree(ownerRead).get("lifecycleVersion").asInt()).isEqualTo(4);
    assertThat(eventRole(alpha, ownerId)).isNull();
    assertThat(eventRole(alpha, adminId)).isNull();

    problem(
        read(member, eventPath(beta), "req-member-other"), 403, "FORBIDDEN", "req-member-other");
    problem(
        read(member, eventPath(UUID.randomUUID()), "req-missing-event"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-missing-event");
    mvc.perform(get(events(spaceId)).header("X-Request-Id", "req-anon"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
  }

  @Test
  void patchRenamesAndRejectsLifecycleStatus() throws Exception {
    UUID spaceId = space("Home");
    UUID ownerId = user("Space Owner");
    UUID memberId = user("Member");
    UUID staffId = user("Staff");
    member(spaceId, ownerId, "OWNER");
    member(spaceId, memberId, "MEMBER");
    member(spaceId, staffId, "MEMBER");
    Cookie member = login(memberId);
    Cookie owner = login(ownerId);
    String created =
        created(write(post(events(spaceId)), member, "{\"name\":\"Alpha\"}", "req-create"));
    UUID eventId = UUID.fromString(json.readTree(created).get("eventId").asString());
    operator(spaceId, eventId, staffId, "STAFF");

    problem(
        write(patch(eventPath(eventId)), owner, "{\"name\":\"소유자\"}", "req-owner-patch"),
        403,
        "FORBIDDEN",
        "req-owner-patch");
    problem(
        write(patch(eventPath(eventId)), login(staffId), "{\"name\":\"스태프\"}", "req-staff-patch"),
        403,
        "FORBIDDEN",
        "req-staff-patch");
    assertThat(storedName(eventId)).isEqualTo("Alpha");
    assertThat(eventRole(eventId, ownerId)).isNull();

    String renamed =
        ok(write(patch(eventPath(eventId)), member, "{\"name\":\"  바뀐 이름  \"}", "req-rename"));
    JsonNode renamedBody = json.readTree(renamed);
    assertThat(renamedBody.propertyNames()).containsExactly(detailKeys());
    assertThat(renamedBody.get("startDate").isNull()).isTrue();
    assertThat(renamedBody.get("place").isNull()).isTrue();
    assertThat(renamedBody.get("eventType").isNull()).isTrue();
    assertThat(renamedBody.get("name").asString()).isEqualTo("바뀐 이름");
    assertThat(renamedBody.get("lifecycleStatus").asString()).isEqualTo("DRAFT");
    assertThat(renamedBody.get("lifecycleVersion").asInt()).isZero();
    assertThat(storedName(eventId)).isEqualTo("바뀐 이름");
    assertThat(storedStatus(eventId)).isEqualTo("DRAFT");
    assertThat(storedVersion(eventId)).isZero();
    assertThat(auditCount(eventId)).isZero();
    assertThat(permissionCount(eventId)).isZero();

    assertField(
        "status",
        problem(
            write(
                patch(eventPath(eventId)),
                member,
                "{\"name\":\"올리면 안 됨\",\"lifecycleStatus\":\"ACTIVE\"}",
                "req-patch-status"),
            400,
            "VALIDATION_FAILED",
            "req-patch-status"),
        "lifecycleStatus");
    assertThat(storedName(eventId)).isEqualTo("바뀐 이름");
    assertThat(storedStatus(eventId)).isEqualTo("DRAFT");
    assertThat(storedVersion(eventId)).isZero();
  }

  @Test
  void createStoresPeriodAndPlaceOnDetailAndList() throws Exception {
    UUID spaceId = space("Home");
    UUID memberId = user("Member");
    member(spaceId, memberId, "MEMBER");
    Cookie member = login(memberId);
    String body =
        """
        {"name":"2026 가을 수련회","startDate":"2026-11-06","endDate":"2026-11-08","place":"  양평 수양관  "}
        """;

    String created = created(write(post(events(spaceId)), member, body, "req-period"));
    JsonNode createdBody = json.readTree(created);
    UUID eventId = UUID.fromString(createdBody.get("eventId").asString());
    assertPeriod(createdBody, "2026-11-06", "2026-11-08", "양평 수양관");
    assertThat(storedDate(eventId, "start_date")).isEqualTo(LocalDate.parse("2026-11-06"));
    assertThat(storedDate(eventId, "end_date")).isEqualTo(LocalDate.parse("2026-11-08"));
    assertThat(storedText(eventId, "place")).isEqualTo("양평 수양관");

    JsonNode detail = json.readTree(ok(read(member, eventPath(eventId), "req-period-detail")));
    assertPeriod(detail, "2026-11-06", "2026-11-08", "양평 수양관");
    JsonNode item =
        json.readTree(ok(read(member, events(spaceId), "req-period-list"))).get("items").get(0);
    assertThat(item.get("eventId").asString()).isEqualTo(eventId.toString());
    assertPeriod(item, "2026-11-06", "2026-11-08", "양평 수양관");

    String startOnly =
        created(
            write(
                post(events(spaceId)),
                member,
                "{\"name\":\"시작만\",\"startDate\":\"2026-12-01\"}",
                "req-start-only"));
    JsonNode startBody = json.readTree(startOnly);
    assertThat(startBody.get("startDate").asString()).isEqualTo("2026-12-01");
    assertThat(startBody.get("endDate").isNull()).isTrue();
    assertThat(startBody.get("place").isNull()).isTrue();
  }

  @Test
  void nameOnlyCreateLeavesPeriodPlaceAndTypeNull() throws Exception {
    UUID spaceId = space("Home");
    UUID memberId = user("Member");
    member(spaceId, memberId, "MEMBER");
    Cookie member = login(memberId);

    JsonNode created =
        json.readTree(
            created(write(post(events(spaceId)), member, "{\"name\":\"이름만\"}", "req-name-only")));
    assertThat(created.get("startDate").isNull()).isTrue();
    assertThat(created.get("endDate").isNull()).isTrue();
    assertThat(created.get("place").isNull()).isTrue();
    assertThat(created.get("eventType").isNull()).isTrue();
    assertThat(created.get("lifecycleStatus").asString()).isEqualTo("DRAFT");
  }

  @Test
  void rejectsBadPeriodAndPlace() throws Exception {
    UUID spaceId = space("Home");
    UUID memberId = user("Member");
    member(spaceId, memberId, "MEMBER");
    Cookie member = login(memberId);

    assertRejectedCreate(
        member,
        spaceId,
        "{\"name\":\"날짜\",\"startDate\":\"2026-13-01\"}",
        "startDate",
        "req-bad-start");
    assertRejectedCreate(
        member, spaceId, "{\"name\":\"날짜\",\"endDate\":\"2026-13-01\"}", "endDate", "req-bad-end");
    assertRejectedCreate(
        member,
        spaceId,
        "{\"name\":\"순서\",\"startDate\":\"2026-11-08\",\"endDate\":\"2026-11-06\"}",
        "endDate",
        "req-order");
    assertRejectedCreate(
        member,
        spaceId,
        "{\"name\":\"장소\",\"place\":\"" + "가".repeat(201) + "\"}",
        "place",
        "req-place");

    JsonNode blank =
        json.readTree(
            created(
                write(
                    post(events(spaceId)),
                    member,
                    "{\"name\":\"공백 장소\",\"place\":\"   \"}",
                    "req-blank-place")));
    assertThat(blank.get("place").isNull()).isTrue();
    assertThat(storedText(UUID.fromString(blank.get("eventId").asString()), "place")).isNull();
  }

  @Test
  void createStoresRetreatAndLeavesOmittedTypeNull() throws Exception {
    UUID spaceId = space("Home");
    UUID memberId = user("Member");
    member(spaceId, memberId, "MEMBER");
    Cookie member = login(memberId);

    JsonNode created =
        json.readTree(
            created(
                write(
                    post(events(spaceId)),
                    member,
                    "{\"name\":\"수련회\",\"eventType\":\"RETREAT\"}",
                    "req-retreat")));
    UUID eventId = UUID.fromString(created.get("eventId").asString());
    assertThat(created.get("eventType").asString()).isEqualTo("RETREAT");
    assertThat(storedText(eventId, "event_type")).isEqualTo("RETREAT");
    JsonNode detail = json.readTree(ok(read(member, eventPath(eventId), "req-retreat-detail")));
    assertThat(detail.get("eventType").asString()).isEqualTo("RETREAT");
    JsonNode item =
        json.readTree(ok(read(member, events(spaceId), "req-retreat-list"))).get("items").get(0);
    assertThat(item.get("eventType").asString()).isEqualTo("RETREAT");

    JsonNode omitted =
        json.readTree(
            created(write(post(events(spaceId)), member, "{\"name\":\"유형 없음\"}", "req-type-omit")));
    assertThat(omitted.get("eventType").isNull()).isTrue();
    JsonNode explicitNull =
        json.readTree(
            created(
                write(
                    post(events(spaceId)),
                    member,
                    "{\"name\":\"유형 널\",\"eventType\":null}",
                    "req-type-null")));
    assertThat(explicitNull.get("eventType").isNull()).isTrue();
    assertThat(storedText(UUID.fromString(explicitNull.get("eventId").asString()), "event_type"))
        .isNull();
  }

  @ParameterizedTest
  @MethodSource("rejectedEventTypes")
  void rejectsEventTypeText(String eventType, String requestId) throws Exception {
    UUID spaceId = space("Home");
    UUID memberId = user("Member");
    member(spaceId, memberId, "MEMBER");
    assertRejectedCreate(
        login(memberId),
        spaceId,
        "{\"name\":\"유형\",\"eventType\":\"" + eventType + "\"}",
        "eventType",
        requestId);
  }

  static Stream<Arguments> rejectedEventTypes() {
    return Stream.of(
        Arguments.of("retreat", "req-type-lower"),
        Arguments.of("수련회", "req-type-ko"),
        Arguments.of("", "req-type-empty"),
        Arguments.of("PARTY", "req-type-party"));
  }

  @Test
  void rejectsNumericEventType() throws Exception {
    UUID spaceId = space("Home");
    UUID memberId = user("Member");
    member(spaceId, memberId, "MEMBER");
    assertRejectedCreate(
        login(memberId),
        spaceId,
        "{\"name\":\"유형\",\"eventType\":1}",
        "eventType",
        "req-type-number");
  }

  @ParameterizedTest
  @EnumSource(EventType.class)
  void storesEveryEventType(EventType eventType) throws Exception {
    UUID spaceId = space("Home");
    UUID memberId = user("Member");
    member(spaceId, memberId, "MEMBER");
    Cookie member = login(memberId);

    JsonNode created =
        json.readTree(
            created(
                write(
                    post(events(spaceId)),
                    member,
                    "{\"name\":\"유형\",\"eventType\":\"" + eventType.name() + "\"}",
                    "req-type-" + eventType.name())));
    UUID eventId = UUID.fromString(created.get("eventId").asString());
    assertThat(created.get("eventType").asString()).isEqualTo(eventType.name());
    assertThat(storedText(eventId, "event_type")).isEqualTo(eventType.name());
    assertThat(
            json.readTree(ok(read(member, eventPath(eventId), "req-type-detail")))
                .get("eventType")
                .asString())
        .isEqualTo(eventType.name());
    assertThat(
            json.readTree(ok(read(member, events(spaceId), "req-type-list")))
                .get("items")
                .get(0)
                .get("eventType")
                .asString())
        .isEqualTo(eventType.name());
  }

  @Test
  void databaseRejectsUnknownEventType() {
    UUID spaceId = space("Home");
    assertThatThrownBy(
            () ->
                jdbc.update(
                    """
                    INSERT INTO events (id, space_id, name, lifecycle_status, lifecycle_version, event_type)
                    VALUES (?, ?, 'party', 'DRAFT', 0, 'PARTY')
                    """,
                    UUID.randomUUID(),
                    spaceId))
        .isInstanceOf(DataAccessException.class);
  }

  @Test
  void rejectsUnknownCreateKey() throws Exception {
    UUID spaceId = space("Home");
    UUID memberId = user("Member");
    member(spaceId, memberId, "MEMBER");
    assertRejectedCreate(
        login(memberId), spaceId, "{\"name\":\"기타\",\"kind\":\"RETREAT\"}", "kind", "req-kind");
  }

  @Test
  void patchKeepsPeriodPlaceAndTypeAndRejectsThoseKeys() throws Exception {
    UUID spaceId = space("Home");
    UUID memberId = user("Member");
    member(spaceId, memberId, "MEMBER");
    Cookie member = login(memberId);
    String created =
        created(
            write(
                post(events(spaceId)),
                member,
                """
                {"name":"원래","startDate":"2026-11-06","endDate":"2026-11-08","place":"양평","eventType":"CAMP"}
                """,
                "req-keep-create"));
    UUID eventId = UUID.fromString(json.readTree(created).get("eventId").asString());

    JsonNode renamed =
        json.readTree(
            ok(write(patch(eventPath(eventId)), member, "{\"name\":\"바뀐 이름\"}", "req-keep-name")));
    assertThat(renamed.get("name").asString()).isEqualTo("바뀐 이름");
    assertPeriod(renamed, "2026-11-06", "2026-11-08", "양평");
    assertThat(renamed.get("eventType").asString()).isEqualTo("CAMP");
    assertThat(storedText(eventId, "event_type")).isEqualTo("CAMP");
    assertThat(storedText(eventId, "place")).isEqualTo("양평");

    assertField(
        "place",
        problem(
            write(patch(eventPath(eventId)), member, "{\"place\":\"서울\"}", "req-patch-place"),
            400,
            "VALIDATION_FAILED",
            "req-patch-place"),
        "place");
    assertField(
        "eventType",
        problem(
            write(
                patch(eventPath(eventId)), member, "{\"eventType\":\"RETREAT\"}", "req-patch-type"),
            400,
            "VALIDATION_FAILED",
            "req-patch-type"),
        "eventType");
    assertThat(storedName(eventId)).isEqualTo("바뀐 이름");
    assertThat(storedText(eventId, "place")).isEqualTo("양평");
    assertThat(storedText(eventId, "event_type")).isEqualTo("CAMP");
    assertThat(storedDate(eventId, "start_date")).isEqualTo(LocalDate.parse("2026-11-06"));
  }

  @Test
  void spacePathProbeStaysNotFoundThenNotAMemberThenForbidden() throws Exception {
    UUID spaceId = space("Home");
    UUID userId = user("Operator");
    member(spaceId, userId, "MEMBER");
    UUID missingId = event(spaceId, "hidden", "DRAFT", 0);
    UUID revokedId = event(spaceId, "revoked", "DRAFT", 0);
    UUID deniedId = event(spaceId, "denied", "DRAFT", 0);
    operator(spaceId, deniedId, userId, "STAFF");
    jdbc.update(
        """
        INSERT INTO event_user_permissions (
          space_id, event_id, user_id, permission, effect, granted_by, granted_at)
        VALUES (?, ?, ?, 'EVENT_READ', 'REVOKE', ?, now())
        """,
        spaceId,
        deniedId,
        userId,
        userId);
    jdbc.update(
        """
        INSERT INTO audit_logs (id, space_id, event_id, actor_user_id, action, detail, occurred_at)
        VALUES (?, ?, ?, ?, 'EVENT_ACCESS_REVOKED', CAST(? AS jsonb), now())
        """,
        UUID.randomUUID(),
        spaceId,
        revokedId,
        userId,
        "{\"userId\":\"" + userId + "\"}");
    Cookie session = login(userId);

    problem(
        read(session, probe(spaceId, missingId), "req-probe-missing"),
        404,
        "RESOURCE_NOT_FOUND",
        "req-probe-missing");
    problem(
        read(session, probe(spaceId, revokedId), "req-probe-revoked"),
        403,
        "NOT_A_MEMBER",
        "req-probe-revoked");
    problem(
        read(session, probe(spaceId, deniedId), "req-probe-denied"),
        403,
        "FORBIDDEN",
        "req-probe-denied");

    problem(
        read(session, eventPath(revokedId), "req-event-revoked"),
        403,
        "NOT_A_MEMBER",
        "req-event-revoked");
    problem(
        read(session, eventPath(deniedId), "req-event-denied"),
        403,
        "FORBIDDEN",
        "req-event-denied");
  }

  private static String[] detailKeys() {
    return new String[] {
      "eventId",
      "name",
      "lifecycleStatus",
      "lifecycleVersion",
      "startDate",
      "endDate",
      "place",
      "eventType"
    };
  }

  private static String[] listKeys() {
    return new String[] {
      "eventId", "name", "lifecycleStatus", "startDate", "endDate", "place", "eventType"
    };
  }

  private static void assertPeriod(JsonNode body, String startDate, String endDate, String place) {
    assertThat(body.get("startDate").asString()).isEqualTo(startDate);
    assertThat(body.get("endDate").asString()).isEqualTo(endDate);
    assertThat(body.get("place").asString()).isEqualTo(place);
  }

  private String lastProblem;

  private void assertRejectedCreate(
      Cookie session, UUID spaceId, String body, String field, String requestId) throws Exception {
    int before = eventCount(spaceId);
    assertField(
        requestId,
        problem(
            write(post(events(spaceId)), session, body, requestId),
            400,
            "VALIDATION_FAILED",
            requestId),
        field);
    assertThat(eventCount(spaceId)).as(requestId).isEqualTo(before);
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

  private static String events(UUID spaceId) {
    return "/api/v1/operator/spaces/" + spaceId + "/events";
  }

  private static String eventPath(UUID eventId) {
    return "/api/v1/operator/events/" + eventId;
  }

  private static String probe(UUID spaceId, UUID eventId) {
    return "/api/v1/operator/spaces/" + spaceId + "/events/" + eventId;
  }

  private UUID space(String name) {
    UUID id = UUID.randomUUID();
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, ?)", id, name);
    return id;
  }

  private UUID user(String name) {
    UUID id = UUID.randomUUID();
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, ?)", id, name);
    return id;
  }

  private void member(UUID spaceId, UUID userId, String role) {
    jdbc.update(
        "INSERT INTO members (space_id, user_id, role) VALUES (?, ?, ?)", spaceId, userId, role);
  }

  private UUID event(UUID spaceId, String name, String status, int version) {
    UUID id = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO events (id, space_id, name, lifecycle_status, lifecycle_version)
        VALUES (?, ?, ?, ?, ?)
        """,
        id,
        spaceId,
        name,
        status,
        version);
    return id;
  }

  private LocalDate storedDate(UUID eventId, String column) {
    return jdbc.queryForObject(
        "SELECT " + column + " FROM events WHERE id = ?", LocalDate.class, eventId);
  }

  private String storedText(UUID eventId, String column) {
    return jdbc.queryForObject(
        "SELECT " + column + " FROM events WHERE id = ?", String.class, eventId);
  }

  private void operator(UUID spaceId, UUID eventId, UUID userId, String role) {
    jdbc.update(
        "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, ?)",
        spaceId,
        eventId,
        userId,
        role);
  }

  private int eventCount(UUID spaceId) {
    Integer count =
        jdbc.queryForObject(
            "SELECT count(*) FROM events WHERE space_id = ?", Integer.class, spaceId);
    return count == null ? 0 : count;
  }

  private String storedName(UUID eventId) {
    return jdbc.queryForObject("SELECT name FROM events WHERE id = ?", String.class, eventId);
  }

  private String storedStatus(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT lifecycle_status FROM events WHERE id = ?", String.class, eventId);
  }

  private int storedVersion(UUID eventId) {
    Integer version =
        jdbc.queryForObject(
            "SELECT lifecycle_version FROM events WHERE id = ?", Integer.class, eventId);
    return version == null ? -1 : version;
  }

  private String eventRole(UUID eventId, UUID userId) {
    return jdbc
        .query(
            "SELECT role FROM event_users WHERE event_id = ? AND user_id = ?",
            (rs, row) -> rs.getString(1),
            eventId,
            userId)
        .stream()
        .findFirst()
        .orElse(null);
  }

  private int permissionCount(UUID eventId) {
    Integer count =
        jdbc.queryForObject(
            "SELECT count(*) FROM event_user_permissions WHERE event_id = ?",
            Integer.class,
            eventId);
    return count == null ? 0 : count;
  }

  private int auditCount(UUID eventId) {
    Integer count =
        jdbc.queryForObject(
            "SELECT count(*) FROM audit_logs WHERE event_id = ?", Integer.class, eventId);
    return count == null ? 0 : count;
  }
}
