package app.scene.event.notice;

import static app.scene.event.notice.NoticeFixture.PARTICIPANT_NOTICES;
import static app.scene.event.notice.NoticeFixture.write;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.event.audience.Audience;
import app.scene.event.audience.AudienceType;
import app.scene.event.audience.ParticipantAudience;
import app.scene.event.notice.NoticeFixture.Operator;
import app.scene.event.notice.NoticeFixture.Person;
import app.scene.event.notice.NoticeFixture.World;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Notices (DEC-082, notice-contract §11, #434). */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class NoticeHttpIT {

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;
  @Autowired TransactionTemplate tx;
  @Autowired NoticeService service;
  @Autowired NoticeBoardVersions boardVersions;
  @Autowired ParticipantAudience audience;

  NoticeFixture f;
  MockMvc mvc;

  @BeforeEach
  void setUp() {
    f = new NoticeFixture(context, jdbc, json);
    mvc = f.mvc;
  }

  private static String id(JsonNode written) {
    return written.get("notice").get("noticeId").asString();
  }

  private static int version(JsonNode written) {
    return written.get("notice").get("version").asInt();
  }

  private JsonNode body(org.springframework.test.web.servlet.ResultActions actions)
      throws Exception {
    return json.readTree(actions.andReturn().getResponse().getContentAsString());
  }

  // §11-1 and the leader follow-ups.
  @Test
  void leaderNoticeReachesOnlyPublishedLeadersAndLeavesWhenTheLeaderIsCleared() throws Exception {
    World w = f.world();
    Person leader = w.participant("조장", "010-5100-0001");
    Person member = w.participant("조원", "010-5100-0002");
    w.publishGroup(leader, member);

    JsonNode written = w.create(w.owner, "조장 모임", "LEADERS", true, null);
    String noticeId = id(written);
    assertThat(written.get("notifiedCount").asInt()).isEqualTo(1);

    JsonNode leaderList = f.list(leader);
    assertThat(leaderList.get("items")).hasSize(1);
    assertThat(leaderList.get("items").get(0).get("leadersOnly").asBoolean()).isTrue();
    assertThat(leaderList.get("items").get(0).get("unread").asBoolean()).isTrue();
    f.read(PARTICIPANT_NOTICES + "/" + noticeId, leader.session());
    assertThat(w.notificationsFor(leader.id(), "NOTICE_PUBLISHED")).isEqualTo(1);

    assertThat(f.list(member).get("items")).isEmpty();
    mvc.perform(get(PARTICIPANT_NOTICES + "/" + noticeId).cookie(member.session()))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
    assertThat(w.notificationsFor(member.id(), "NOTICE_PUBLISHED")).isZero();

    // A new publication without the leader mark: the next read no longer shows it.
    w.setLeader(w.firstGroupId());
    w.publishGroups();
    assertThat(f.list(leader).get("items")).isEmpty();
    mvc.perform(get(PARTICIPANT_NOTICES + "/" + noticeId).cookie(leader.session()))
        .andExpect(status().isNotFound());
  }

  // §11-2.
  @Test
  void staffNoticeStaysOffParticipantPathsAndNotifiesOtherActiveOperators() throws Exception {
    World w = f.world();
    Person a = w.participant("가", "010-5200-0001");
    Operator manager = w.operator("MANAGER");
    Operator staff = w.operator("STAFF");
    Operator removed = w.operator("STAFF");
    w.removeOperator(removed);
    long feed = w.participantNotices();

    JsonNode written = w.create(manager, "운영진 집합", "STAFF", true, null);
    String noticeId = id(written);
    assertThat(written.get("notifiedCount").asInt()).isEqualTo(2);
    assertThat(w.operatorNotifications(w.owner.id(), "STAFF_NOTICE_PUBLISHED")).isEqualTo(1);
    assertThat(w.operatorNotifications(staff.id(), "STAFF_NOTICE_PUBLISHED")).isEqualTo(1);
    assertThat(w.operatorNotifications(manager.id(), "STAFF_NOTICE_PUBLISHED")).isZero();
    assertThat(w.operatorNotifications(removed.id(), "STAFF_NOTICE_PUBLISHED")).isZero();
    assertThat(w.notificationsFor(a.id(), "NOTICE_PUBLISHED")).isZero();

    assertThat(f.list(a).get("items")).isEmpty();
    mvc.perform(get(PARTICIPANT_NOTICES + "/" + noticeId).cookie(a.session()))
        .andExpect(status().isNotFound());
    JsonNode notifications = f.read("/api/v1/participant/notifications", a.session());
    assertThat(notifications.get("items")).isEmpty();
    assertThat(w.participantNotices()).isEqualTo(feed);

    // The operator home card reads the same list route.
    JsonNode card = f.read(w.notices("?status=PUBLISHED&audience=STAFF&limit=3"), staff.session());
    assertThat(card.get("items")).hasSize(1);
  }

  // §11-3 and the refresh table (§6).
  @Test
  void participantValueRisesOnlyForChangesParticipantsCanSee() throws Exception {
    World w = f.world();
    w.participant("가", "010-5300-0001");
    long board = w.boardVersion();

    JsonNode draft = w.create(w.owner, "초안", "ALL", false, null);
    String id = id(draft);
    assertThat(draft.get("notice").get("status").asString()).isEqualTo("DRAFT");
    assertThat(draft.get("notifiedCount").asInt()).isZero();
    assertThat(w.participantNotices()).isZero();
    assertThat(w.boardVersion()).isEqualTo(board + 1);
    w.patch(w.owner, id, "{\"expectedVersion\":1,\"title\":\"초안 2\"}").andExpect(status().isOk());
    assertThat(w.participantNotices()).isZero();
    assertThat(w.boardVersion()).isEqualTo(board + 2);

    w.command(w.owner, id, "publish", 2)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.result").value("PUBLISHED"))
        .andExpect(jsonPath("$.notifiedCount").value(1));
    assertThat(w.participantNotices()).isEqualTo(1);
    w.command(w.owner, id, "publish", 3).andExpect(jsonPath("$.result").value("ALREADY_PUBLISHED"));
    assertThat(w.participantNotices()).isEqualTo(1);
    assertThat(w.boardVersion()).isEqualTo(board + 3);

    w.patch(w.owner, id, "{\"expectedVersion\":3,\"title\":\"고친 제목\"}").andExpect(status().isOk());
    assertThat(w.participantNotices()).isEqualTo(2);
    w.patch(w.owner, id, "{\"expectedVersion\":4,\"pinned\":true}").andExpect(status().isOk());
    assertThat(w.participantNotices()).isEqualTo(3);
    // Same values: nothing changes.
    w.patch(w.owner, id, "{\"expectedVersion\":5,\"pinned\":true}")
        .andExpect(jsonPath("$.notice.version").value(5));
    assertThat(w.participantNotices()).isEqualTo(3);
    w.command(w.owner, id, "archive", 5).andExpect(jsonPath("$.result").value("ARCHIVED"));
    assertThat(w.participantNotices()).isEqualTo(4);
    w.command(w.owner, id, "unarchive", 6)
        .andExpect(jsonPath("$.result").value("UNARCHIVED"))
        .andExpect(jsonPath("$.notice.status").value("PUBLISHED"))
        .andExpect(jsonPath("$.notice.pinned").value(false));
    assertThat(w.participantNotices()).isEqualTo(5);

    // STAFF only: no participant value; widening to ALL raises it.
    JsonNode staff = w.create(w.owner, "운영진", "STAFF", true, null);
    assertThat(w.participantNotices()).isEqualTo(5);
    w.patch(w.owner, id(staff), "{\"expectedVersion\":1,\"title\":\"운영진 2\"}")
        .andExpect(status().isOk());
    assertThat(w.participantNotices()).isEqualTo(5);
    w.patch(w.owner, id(staff), "{\"expectedVersion\":2,\"audience\":[{\"type\":\"ALL\"}]}")
        .andExpect(status().isOk());
    assertThat(w.participantNotices()).isEqualTo(6);
    // The operator value read by the shared reader matches.
    assertThat(boardVersions.read(w.spaceId, w.eventId)).isEqualTo(w.boardVersion());
  }

  @Test
  void aPublishThatFailsLaterInTheTransactionLeavesNoValueNotificationOrStatus() throws Exception {
    World w = f.world();
    Person a = w.participant("가", "010-5400-0001");
    String id = id(w.create(w.owner, "초안", "ALL", false, null));

    assertThatThrownBy(
            () ->
                tx.executeWithoutResult(
                    status -> {
                      service.publish(
                          w.owner.id(),
                          w.eventId,
                          UUID.fromString(id),
                          json.readTree("{\"expectedVersion\":1}"));
                      throw new IllegalStateException("fails after the publish");
                    }))
        .isInstanceOf(IllegalStateException.class);
    assertThat(w.participantNotices()).isZero();
    assertThat(w.notificationsFor(a.id(), "NOTICE_PUBLISHED")).isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT status FROM notices WHERE id = ?", String.class, UUID.fromString(id)))
        .isEqualTo("DRAFT");
  }

  // §11-4.
  @Test
  void editingAPublishedNoticeSetsEditedAtAndNotifiesOnlyWhenAsked() throws Exception {
    World w = f.world();
    Person a = w.participant("가", "010-5500-0001");
    JsonNode draft = w.create(w.owner, "초안", "ALL", false, null);
    String id = id(draft);
    JsonNode draftEdit = body(w.patch(w.owner, id, "{\"expectedVersion\":1,\"body\":\"새 본문\"}"));
    assertThat(draftEdit.get("notice").get("editedAt").isNull()).isTrue();

    JsonNode published = body(w.command(w.owner, id, "publish", 2));
    String publishedAt = published.get("notice").get("publishedAt").asString();
    assertThat(published.get("notice").get("firstPublishedAt").asString()).isEqualTo(publishedAt);

    JsonNode edited = body(w.patch(w.owner, id, "{\"expectedVersion\":3,\"title\":\"시간 정정\"}"));
    assertThat(edited.get("notice").get("editedAt").isNull()).isFalse();
    assertThat(edited.get("notice").get("publishedAt").asString()).isEqualTo(publishedAt);
    assertThat(edited.get("notifiedCount").asInt()).isZero();
    assertThat(w.notificationsFor(a.id(), "NOTICE_UPDATED")).isZero();
    String editedAt = edited.get("notice").get("editedAt").asString();

    // Pin only: editedAt stays, no audit.
    JsonNode pinned = body(w.patch(w.owner, id, "{\"expectedVersion\":4,\"pinned\":true}"));
    assertThat(pinned.get("notice").get("editedAt").asString()).isEqualTo(editedAt);

    JsonNode notified =
        body(w.patch(w.owner, id, "{\"expectedVersion\":5,\"important\":true,\"notify\":true}"));
    assertThat(notified.get("notifiedCount").asInt()).isEqualTo(1);
    assertThat(w.notificationsFor(a.id(), "NOTICE_UPDATED")).isEqualTo(1);
    JsonNode item = f.list(a).get("items").get(0);
    assertThat(item.get("editedAt").isNull()).isFalse();
    assertThat(item.get("important").asBoolean()).isTrue();

    List<String> updates =
        jdbc.queryForList(
            "SELECT detail FROM audit_logs WHERE event_id = ? AND action = 'NOTICE_UPDATED'"
                + " ORDER BY occurred_at",
            String.class,
            w.eventId);
    assertThat(updates).hasSize(2);
    assertThat(json.readTree(updates.get(1)).get("fields").toString()).contains("important");
    assertThat(json.readTree(updates.get(1)).get("notify").asBoolean()).isTrue();
  }

  // §11-5.
  @Test
  void endedEventStillPublishesAndArchivedEventRefusesWrites() throws Exception {
    World w = f.world();
    Person a = w.participant("가", "010-5600-0001");
    w.setEventStatus("ENDED");
    JsonNode later = w.create(w.owner, "후속 공지", "ALL", true, null);
    assertThat(later.get("notice").get("status").asString()).isEqualTo("PUBLISHED");

    w.setEventStatus("ARCHIVED");
    mvc.perform(
            write(post(w.notices("")), w.owner.session())
                .content("{\"title\":\"t\",\"body\":\"b\",\"audience\":[{\"type\":\"ALL\"}]}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("EVENT_ARCHIVED"));
    w.command(w.owner, id(later), "archive", 1)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("EVENT_ARCHIVED"));
    // Reads keep working for operators and participants.
    assertThat(f.read(w.notices(""), w.owner.session()).get("items")).hasSize(1);
    assertThat(f.list(a).get("items")).hasSize(1);
  }

  // §11-6.
  @Test
  void aFourthPinIsAConflictUntilAPinIsArchived() throws Exception {
    World w = f.world();
    List<String> pinned = new ArrayList<>();
    for (int i = 0; i < 3; i++) {
      pinned.add(id(w.create(w.owner, "고정 " + i, "ALL", true, "\"pinned\":true")));
    }
    mvc.perform(
            write(post(w.notices("")), w.owner.session())
                .content(
                    "{\"title\":\"넷째\",\"body\":\"b\",\"audience\":[{\"type\":\"ALL\"}],"
                        + "\"pinned\":true,\"publish\":true}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CONFLICT"))
        .andExpect(jsonPath("$.reason").value("PIN_LIMIT"))
        .andExpect(jsonPath("$.pinnedNoticeIds.length()").value(3));
    // A pinned draft is stored; publishing it hits the limit.
    JsonNode draft = w.create(w.owner, "고정 초안", "ALL", false, "\"pinned\":true");
    w.command(w.owner, id(draft), "publish", 1)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.reason").value("PIN_LIMIT"));
    String plain = id(w.create(w.owner, "보통", "ALL", true, null));
    w.patch(w.owner, plain, "{\"expectedVersion\":1,\"pinned\":true}")
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.reason").value("PIN_LIMIT"));

    JsonNode list = f.read(w.notices(""), w.owner.session());
    assertThat(list.get("pinnedCount").asInt()).isEqualTo(3);

    w.command(w.owner, pinned.get(0), "archive", 1)
        .andExpect(jsonPath("$.notice.pinned").value(false));
    w.patch(w.owner, plain, "{\"expectedVersion\":1,\"pinned\":true}").andExpect(status().isOk());
  }

  // §11-7.
  @Test
  void auditDetailsCarryNoTitleOrBody() throws Exception {
    World w = f.world();
    w.participant("가", "010-5700-0001");
    String id = id(w.create(w.owner, "비밀제목", "ALL", true, null));
    w.patch(w.owner, id, "{\"expectedVersion\":1,\"body\":\"010-1234-5678 비밀본문\"}")
        .andExpect(status().isOk());
    w.command(w.owner, id, "archive", 2).andExpect(status().isOk());
    w.command(w.owner, id, "unarchive", 3).andExpect(status().isOk());
    // Draft writes are not audited.
    w.create(w.owner, "초안제목", "ALL", false, null);

    List<String> actions =
        jdbc.queryForList(
            "SELECT action FROM audit_logs WHERE event_id = ? AND action LIKE 'NOTICE_%'"
                + " ORDER BY occurred_at",
            String.class, w.eventId);
    assertThat(actions)
        .containsExactly(
            "NOTICE_PUBLISHED", "NOTICE_UPDATED", "NOTICE_ARCHIVED", "NOTICE_UNARCHIVED");
    for (String detail :
        jdbc.queryForList(
            "SELECT detail FROM audit_logs WHERE event_id = ? AND action LIKE 'NOTICE_%'",
            String.class, w.eventId)) {
      assertThat(detail).doesNotContain("비밀").doesNotContain("010-1234").doesNotContain("본문");
    }
    JsonNode published =
        json.readTree(
            jdbc.queryForObject(
                "SELECT detail FROM audit_logs WHERE event_id = ? AND action = 'NOTICE_PUBLISHED'",
                String.class,
                w.eventId));
    assertThat(published.get("audienceTypes").get(0).asString()).isEqualTo("ALL");
    assertThat(published.get("notifiedCount").asInt()).isEqualTo(1);
  }

  @Test
  void withdrawnParticipantsSeeNothingAndGetNoNotification() throws Exception {
    World w = f.world();
    Person stays = w.participant("가", "010-5800-0001");
    Person gone = w.participant("나", "010-5800-0002");
    String before = id(w.create(w.owner, "전에", "ALL", true, null));
    w.withdraw(gone);
    JsonNode after = w.create(w.owner, "뒤에", "ALL", true, null);
    assertThat(after.get("notifiedCount").asInt()).isEqualTo(1);
    assertThat(w.notificationsFor(gone.id(), "NOTICE_PUBLISHED")).isEqualTo(1);
    // DEC-084: the leftover cookie of a withdrawn participant is 401 before any audience check.
    mvc.perform(get(PARTICIPANT_NOTICES).cookie(gone.session()))
        .andExpect(status().isUnauthorized());
    mvc.perform(get(PARTICIPANT_NOTICES + "/" + before).cookie(gone.session()))
        .andExpect(status().isUnauthorized());
    // Even with a session, the audience check alone hides everything from them.
    ParticipantAudience.Viewer viewer = audience.viewer(w.spaceId, w.eventId, gone.id());
    assertThat(viewer.active()).isFalse();
    assertThat(viewer.sees(Audience.of(AudienceType.ALL))).isFalse();
    assertThat(f.list(stays).get("items")).hasSize(2);
  }

  @Test
  void participantRoutesNeedAParticipantSession() throws Exception {
    World w = f.world();
    Person a = w.participant("가", "010-5900-0001");
    String id = id(w.create(w.owner, "공지", "ALL", true, null));
    mvc.perform(get(PARTICIPANT_NOTICES)).andExpect(status().isUnauthorized());
    mvc.perform(get(PARTICIPANT_NOTICES + "/" + id)).andExpect(status().isUnauthorized());
    mvc.perform(get(PARTICIPANT_NOTICES).cookie(w.owner.session()))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
    mvc.perform(get(PARTICIPANT_NOTICES).cookie(new Cookie("SCENE_PSESSION", "x".repeat(64))))
        .andExpect(status().isUnauthorized());
    jdbc.update("UPDATE participants SET pin_temporary = true WHERE id = ?", a.id());
    mvc.perform(get(PARTICIPANT_NOTICES).cookie(a.session()))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("PARTICIPANT_PIN_CHANGE_REQUIRED"));
    mvc.perform(get(PARTICIPANT_NOTICES + "/" + id).cookie(a.session()))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("PARTICIPANT_PIN_CHANGE_REQUIRED"));
  }

  @Test
  void participantResponsesHoldOnlyTheirOwnFields() throws Exception {
    World w = f.world();
    Person a = w.participant("가", "010-6000-0001");
    w.participant("다른사람", "010-6000-0002");
    String longBody = "첫 줄\n" + "가".repeat(100);
    JsonNode created =
        json.readTree(
            mvc.perform(
                    write(post(w.notices("")), w.owner.session())
                        .content(
                            "{\"title\":\"제목\",\"body\":\""
                                + longBody.replace("\n", "\\n")
                                + "\",\"audience\":[{\"type\":\"ALL\"}],\"publish\":true,"
                                + "\"important\":true}"))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString());
    String id = id(created);
    assertThat(created.get("notice").get("createdByDisplayName").asString()).isEqualTo("소유자");

    String listText =
        mvc.perform(get(PARTICIPANT_NOTICES).cookie(a.session()))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store"))
            .andReturn()
            .getResponse()
            .getContentAsString();
    JsonNode item = json.readTree(listText).get("items").get(0);
    assertThat(item.propertyNames())
        .containsExactlyInAnyOrder(
            "noticeId",
            "title",
            "bodyPreview",
            "important",
            "pinned",
            "leadersOnly",
            "publishedAt",
            "editedAt",
            "unread");
    assertThat(item.get("bodyPreview").asString()).startsWith("첫 줄 가").endsWith("…");
    assertThat(item.get("bodyPreview").asString().codePointCount(0, 81)).isLessThanOrEqualTo(81);
    assertThat(listText).doesNotContain("소유자").doesNotContain("다른사람").doesNotContain("audience");

    String detailText =
        mvc.perform(get(PARTICIPANT_NOTICES + "/" + id).cookie(a.session()))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store"))
            .andReturn()
            .getResponse()
            .getContentAsString();
    JsonNode detail = json.readTree(detailText);
    assertThat(detail.get("body").asString()).isEqualTo(longBody);
    assertThat(detailText).doesNotContain("소유자").doesNotContain("audience");
    // Reading does not mark read; the screen calls notifications/read with the target.
    assertThat(detail.get("unread").asBoolean()).isTrue();
    mvc.perform(
            write(post("/api/v1/participant/notifications/read"), a.session())
                .content("{\"target\":{\"type\":\"NOTICE\",\"id\":\"" + id + "\"}}"))
        .andExpect(status().isOk());
    assertThat(f.list(a).get("items").get(0).get("unread").asBoolean()).isFalse();
  }

  @Test
  void permissions() throws Exception {
    World w = f.world();
    Operator staff = w.operator("STAFF");
    Operator manager = w.operator("MANAGER");
    String body = "{\"title\":\"t\",\"body\":\"b\",\"audience\":[{\"type\":\"ALL\"}]}";
    mvc.perform(write(post(w.notices("")), staff.session()).content(body))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    String id = id(w.create(manager, "매니저 공지", "ALL", false, null));
    w.command(staff, id, "publish", 1).andExpect(status().isForbidden());
    w.patch(staff, id, "{\"expectedVersion\":1,\"title\":\"x\"}").andExpect(status().isForbidden());
    mvc.perform(write(delete(w.notices("/" + id + "?expectedVersion=1")), staff.session()))
        .andExpect(status().isForbidden());
    assertThat(f.read(w.notices(""), staff.session()).get("items")).hasSize(1);
    f.read(w.notices("/" + id), staff.session());
    // A revoked NOTICE_WRITE on a manager blocks writes.
    jdbc.update(
        "INSERT INTO event_user_permissions (space_id, event_id, user_id, permission, effect,"
            + " granted_by, granted_at) VALUES (?, ?, ?, 'NOTICE_WRITE', 'REVOKE', ?, now())",
        w.spaceId,
        w.eventId,
        manager.id(),
        w.owner.id());
    mvc.perform(write(post(w.notices("")), manager.session()).content(body))
        .andExpect(status().isForbidden());
    // A stranger sees nothing.
    UUID strangerId = UUID.randomUUID();
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, '남')", strangerId);
    mvc.perform(get(w.notices("")).cookie(f.login(strangerId))).andExpect(status().isNotFound());
  }

  @Test
  void stateCommandsVersionsAndDelete() throws Exception {
    World w = f.world();
    Person a = w.participant("가", "010-6100-0001");
    String draft = id(w.create(w.owner, "초안", "ALL", false, null));

    JsonNode stale = body(w.patch(w.owner, draft, "{\"expectedVersion\":9,\"title\":\"x\"}"));
    assertThat(stale.get("code").asString()).isEqualTo("CONCURRENT_MODIFICATION");
    assertThat(stale.get("notice").get("version").asInt()).isEqualTo(1);
    assertThat(stale.get("notice").has("title")).isFalse();
    assertThat(stale.toString()).doesNotContain("초안");

    // Never published: archive → unarchive goes back to DRAFT.
    w.command(w.owner, draft, "archive", 1)
        .andExpect(jsonPath("$.notice.status").value("ARCHIVED"));
    w.command(w.owner, draft, "archive", 1)
        .andExpect(jsonPath("$.result").value("ALREADY_ARCHIVED"));
    w.patch(w.owner, draft, "{\"expectedVersion\":2,\"title\":\"x\"}")
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("INVALID_STATE_TRANSITION"))
        .andExpect(jsonPath("$.noticeStatus").value("ARCHIVED"));
    w.command(w.owner, draft, "publish", 2)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("INVALID_STATE_TRANSITION"));
    w.command(w.owner, draft, "unarchive", 2)
        .andExpect(jsonPath("$.notice.status").value("DRAFT"))
        .andExpect(jsonPath("$.notice.firstPublishedAt").doesNotExist());
    w.command(w.owner, draft, "unarchive", 3)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.noticeStatus").value("DRAFT"));
    mvc.perform(write(delete(w.notices("/" + draft + "?expectedVersion=1")), w.owner.session()))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CONCURRENT_MODIFICATION"));
    mvc.perform(write(delete(w.notices("/" + draft + "?expectedVersion=3")), w.owner.session()))
        .andExpect(status().isNoContent());
    f.mvc
        .perform(get(w.notices("/" + draft)).cookie(w.owner.session()))
        .andExpect(status().isNotFound());

    String published = id(w.create(w.owner, "발행", "ALL", true, null));
    mvc.perform(write(delete(w.notices("/" + published + "?expectedVersion=1")), w.owner.session()))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("INVALID_STATE_TRANSITION"))
        .andExpect(jsonPath("$.noticeStatus").value("PUBLISHED"));
    assertThat(f.list(a).get("items").get(0).get("unread").asBoolean()).isTrue();
    // Archiving marks the notification read and hides it.
    w.command(w.owner, published, "archive", 1).andExpect(status().isOk());
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM notifications WHERE target_id = ? AND read_at IS NULL",
                Integer.class,
                UUID.fromString(published)))
        .isZero();
    assertThat(f.list(a).get("items")).isEmpty();
    // Unarchive brings it back without a new notification.
    w.command(w.owner, published, "unarchive", 2).andExpect(jsonPath("$.notifiedCount").value(0));
    assertThat(f.list(a).get("items")).hasSize(1);
    assertThat(f.list(a).get("items").get(0).get("unread").asBoolean()).isFalse();
    assertThat(w.notificationsFor(a.id(), "NOTICE_PUBLISHED")).isEqualTo(1);
  }

  @Test
  void validation() throws Exception {
    World w = f.world();
    String[] bad = {
      "{\"body\":\"b\",\"audience\":[{\"type\":\"ALL\"}]}",
      "{\"title\":\"" + "가".repeat(101) + "\",\"body\":\"b\",\"audience\":[{\"type\":\"ALL\"}]}",
      "{\"title\":\"t\",\"body\":\"   \",\"audience\":[{\"type\":\"ALL\"}]}",
      "{\"title\":\"t\",\"body\":\"b\",\"audience\":[{\"type\":\"ROOM\"}]}",
      "{\"title\":\"t\",\"body\":\"b\",\"audience\":[{\"type\":\"ALL\"},{\"type\":\"STAFF\"}]}",
      "{\"title\":\"t\",\"body\":\"b\",\"audience\":[{\"type\":\"ALL\"}],\"pinned\":\"yes\"}",
    };
    String[] fields = {"title", "title", "body", "audience", "audience", "pinned"};
    for (int i = 0; i < bad.length; i++) {
      mvc.perform(write(post(w.notices("")), w.owner.session()).content(bad[i]))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.errors[0].field").value(fields[i]));
    }
    String id = id(w.create(w.owner, "공지", "ALL", false, null));
    w.patch(w.owner, id, "{\"title\":\"x\"}")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0].field").value("expectedVersion"));
    for (String query : new String[] {"?status=GONE", "?audience=ROOM", "?limit=0", "?limit=51"}) {
      mvc.perform(get(w.notices(query)).cookie(w.owner.session()))
          .andExpect(status().isBadRequest());
    }
    mvc.perform(get(w.notices("?before=@@")).cookie(w.owner.session()))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0].field").value("before"));
    mvc.perform(get(w.notices("/" + UUID.randomUUID())).cookie(w.owner.session()))
        .andExpect(status().isNotFound());
  }

  @Test
  void operatorListFiltersOrdersAndPages() throws Exception {
    World w = f.world();
    String old = id(w.create(w.owner, "오래된", "ALL", true, null));
    String staff = id(w.create(w.owner, "운영진", "STAFF", true, null));
    String pin = id(w.create(w.owner, "고정", "LEADERS", true, "\"pinned\":true"));
    String draft = id(w.create(w.owner, "초안", "ALL", false, null));
    String archived = id(w.create(w.owner, "보관", "ALL", true, null));
    w.command(w.owner, archived, "archive", 1).andExpect(status().isOk());

    JsonNode all = f.read(w.notices(""), w.owner.session());
    List<String> order = new ArrayList<>();
    all.get("items").forEach(item -> order.add(item.get("noticeId").asString()));
    assertThat(order).containsExactly(pin, draft, staff, old);
    assertThat(all.get("pinnedCount").asInt()).isEqualTo(1);
    assertThat(all.get("nextBefore").isNull()).isTrue();
    assertThat(all.get("items").get(0).get("audience").get(0).get("type").asString())
        .isEqualTo("LEADERS");

    JsonNode onlyArchived = f.read(w.notices("?status=ARCHIVED"), w.owner.session());
    assertThat(onlyArchived.get("items")).hasSize(1);
    JsonNode staffAndAll =
        f.read(w.notices("?status=PUBLISHED,ARCHIVED&audience=STAFF,LEADERS"), w.owner.session());
    assertThat(staffAndAll.get("items")).hasSize(2);

    JsonNode first = f.read(w.notices("?limit=3"), w.owner.session());
    assertThat(first.get("items")).hasSize(3);
    JsonNode second =
        f.read(
            w.notices("?limit=3&before=" + first.get("nextBefore").asString()), w.owner.session());
    assertThat(second.get("items")).hasSize(1);
    assertThat(second.get("items").get(0).get("noticeId").asString()).isEqualTo(old);
    assertThat(second.get("nextBefore").isNull()).isTrue();
  }

  @Test
  void participantListPutsPinsFirstAndPagesAfterTheAudienceFilter() throws Exception {
    World w = f.world();
    Person leader = w.participant("조장", "010-6200-0001");
    Person member = w.participant("조원", "010-6200-0002");
    w.publishGroup(leader, member);
    List<String> visible = new ArrayList<>();
    for (int i = 0; i < 5; i++) {
      visible.add(0, id(w.create(w.owner, "전체 " + i, "ALL", true, null)));
      w.create(w.owner, "조장 " + i, "LEADERS", true, null);
      w.create(w.owner, "운영 " + i, "STAFF", true, null);
    }
    w.create(w.owner, "초안", "ALL", false, null);
    String pin = id(w.create(w.owner, "고정", "ALL", true, "\"pinned\":true"));

    List<String> seen = new ArrayList<>();
    String before = null;
    int pages = 0;
    do {
      JsonNode page =
          f.read(
              PARTICIPANT_NOTICES + "?limit=2" + (before == null ? "" : "&before=" + before),
              member.session());
      assertThat(page.get("items").size()).isBetween(1, 2);
      page.get("items").forEach(item -> seen.add(item.get("noticeId").asString()));
      before = page.get("nextBefore").isNull() ? null : page.get("nextBefore").asString();
      pages++;
    } while (before != null && pages < 10);
    List<String> expected = new ArrayList<>();
    expected.add(pin);
    expected.addAll(visible);
    assertThat(seen).containsExactlyElementsOf(expected);
    assertThat(pages).isEqualTo(3);
    assertThat(f.list(leader).get("items")).hasSize(11);
    mvc.perform(get(PARTICIPANT_NOTICES + "?limit=51").cookie(member.session()))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0].field").value("limit"));
  }
}
