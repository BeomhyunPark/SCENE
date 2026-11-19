package app.scene.event.group;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.web.RequestIdFilter;
import app.scene.support.ParticipantSessions;
import app.scene.support.PostgresTestcontainer;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import jakarta.servlet.http.Cookie;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
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

/**
 * Group publication, the operator published view, and the participant's own group (#300, DEC-072,
 * api.md "조 편성").
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class GroupPublicationHttpIT {

  private static final String OPERATOR_COOKIE = "SCENE_SESSION";
  private static final String PARTICIPANT_COOKIE = "SCENE_PSESSION";
  private static final String CSRF_COOKIE = "XSRF-TOKEN";
  private static final String CSRF_HEADER = "X-XSRF-TOKEN";
  private static final String CSRF = "csrf-token";
  private static final String BAD = "VALIDATION_FAILED";
  private static final String MISSING = "RESOURCE_NOT_FOUND";
  private static final String STALE = "CONCURRENT_MODIFICATION";
  private static final String MY_GROUP = "/api/v1/participant/group";

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
  void publishSnapshotsTheWorkingCopyAndParticipantsKeepSeeingTheLatestPublication()
      throws Exception {
    World w = world();
    Person lead = w.participant("가조장", "010-2000-0001", "94");
    Person mate = w.participant("나조원", "010-2000-0002", "95");
    Person other = w.participant("다다른", "010-2000-0003", "96");
    String g1 = createGroup(w, "1조");
    String g2 = createGroup(w, "2조");
    assign(w, change(lead.id, null, g1), change(mate.id, null, g1), change(other.id, null, g2));
    ok(leaders(w, g1, 0, lead.id));

    assertThat(myGroup(mate).get("status").asString()).isEqualTo("NOT_PUBLISHED");
    JsonNode none = published(w);
    assertThat(none.propertyNames()).containsExactly("publishedAt", "groups", "unassigned");
    assertThat(none.get("publishedAt").isNull()).isTrue();
    assertThat(none.get("groups").size()).isZero();
    assertThat(none.get("unassigned").size()).isZero();
    JsonNode before = board(w).get("publication");
    assertThat(before.get("changedParticipantCount").asLong()).isEqualTo(3);
    assertThat(before.get("groupChanges").asLong()).isEqualTo(2);

    int audits = auditCount(w.eventId);
    long version = boardVersion(w);
    JsonNode first = publish(w, version, false);
    assertThat(first.propertyNames())
        .containsExactly(
            "result",
            "publicationId",
            "publishedAt",
            "boardVersion",
            "assignedCount",
            "unassignedCount",
            "changedParticipantCount");
    assertThat(first.get("result").asString()).isEqualTo("PUBLISHED");
    assertThat(first.get("boardVersion").asLong()).isEqualTo(version);
    assertThat(first.get("assignedCount").asLong()).isEqualTo(3);
    assertThat(first.get("unassignedCount").asLong()).isZero();
    assertThat(first.get("changedParticipantCount").asLong()).isEqualTo(3);
    assertThat(publicationCount(w)).isEqualTo(1);
    assertThat(auditCount(w.eventId)).isEqualTo(audits + 1);
    JsonNode detail =
        json.readTree(
            jdbc.queryForObject(
                "SELECT detail FROM audit_logs WHERE event_id = ? AND action = 'GROUPS_PUBLISHED'",
                String.class,
                w.eventId));
    assertThat(detail.propertyNames())
        .containsExactlyInAnyOrder(
            "publicationId",
            "boardVersion",
            "assignedCount",
            "unassignedCount",
            "changedParticipantCount");
    assertThat(detail.get("publicationId").asString())
        .isEqualTo(first.get("publicationId").asString());
    assertThat(detail.get("changedParticipantCount").asLong()).isEqualTo(3);

    // The same request again leaves one publication row and no new audit row.
    JsonNode again = publish(w, version, false);
    assertThat(again.get("result").asString()).isEqualTo("ALREADY_PUBLISHED");
    assertThat(again.get("publicationId").asString())
        .isEqualTo(first.get("publicationId").asString());
    assertThat(again.get("publishedAt").asString()).isEqualTo(first.get("publishedAt").asString());
    assertThat(again.get("changedParticipantCount").asLong()).isZero();
    assertThat(publicationCount(w)).isEqualTo(1);
    assertThat(auditCount(w.eventId)).isEqualTo(audits + 1);

    JsonNode board = board(w);
    JsonNode summary = board.get("publication");
    assertThat(summary.get("lastPublishedAt").asString())
        .isEqualTo(first.get("publishedAt").asString());
    assertThat(summary.get("lastPublishedByDisplayName").asString()).isEqualTo("Owner");
    assertThat(summary.get("lastPublishedBoardVersion").asLong()).isEqualTo(version);
    assertThat(summary.get("changedParticipantCount").asLong()).isZero();
    assertThat(summary.get("groupChanges").asLong()).isZero();
    assertThat(summary.get("hasUnpublishedChanges").asBoolean()).isFalse();
    JsonNode leadItem = item(board.get("participants"), lead.id);
    assertThat(leadItem.get("publishedGroupId").asString()).isEqualTo(g1);
    assertThat(leadItem.get("publishedLeader").asBoolean()).isTrue();
    assertThat(item(board.get("participants"), mate.id).get("publishedLeader").asBoolean())
        .isFalse();

    // Working-copy edits stay off the participant view until the next publication.
    assign(w, change(mate.id, g1, g2));
    ok(rename(w, g2, "새2조", 0));
    JsonNode changed = board(w).get("publication");
    assertThat(changed.get("changedParticipantCount").asLong()).isEqualTo(1);
    assertThat(changed.get("groupChanges").asLong()).isEqualTo(1);
    assertThat(changed.get("hasUnpublishedChanges").asBoolean()).isTrue();
    JsonNode stillOld = myGroup(mate);
    assertThat(stillOld.get("status").asString()).isEqualTo("ASSIGNED");
    assertThat(stillOld.get("group").get("name").asString()).isEqualTo("1조");
    assertThat(groupNames(published(w))).containsExactly("1조", "2조");

    // A stale board version saves nothing and reports the current one.
    problem(publishRequest(w, "{\"expectedBoardVersion\":" + version + "}"), 409, STALE)
        .andExpect(jsonPath("$.boardVersion").value((int) boardVersion(w)));
    assertThat(publicationCount(w)).isEqualTo(1);

    JsonNode second = publish(w, boardVersion(w), false);
    assertThat(second.get("result").asString()).isEqualTo("PUBLISHED");
    assertThat(second.get("changedParticipantCount").asLong()).isEqualTo(1);
    assertThat(publicationCount(w)).isEqualTo(2);
    JsonNode moved = myGroup(mate);
    assertThat(moved.get("group").get("name").asString()).isEqualTo("새2조");
    assertThat(moved.get("publishedAt").asString()).isEqualTo(second.get("publishedAt").asString());

    // Moving someone back and forth is no change against the publication. The last member comes
    // back to the end, so the member order is the same too.
    assign(w, change(mate.id, g2, g1));
    assign(w, change(mate.id, g1, g2));
    JsonNode same = publish(w, boardVersion(w), false);
    assertThat(same.get("result").asString()).isEqualTo("ALREADY_PUBLISHED");
    assertThat(publicationCount(w)).isEqualTo(2);
  }

  @Test
  void unassignedActiveParticipantsNeedConfirmation() throws Exception {
    World w = world();
    // The first publication goes through with no group at all.
    JsonNode empty = publish(w, 0, false);
    assertThat(empty.get("result").asString()).isEqualTo("PUBLISHED");
    assertThat(publish(w, 0, false).get("result").asString()).isEqualTo("ALREADY_PUBLISHED");

    Person in = w.participant("가배정", "010-3000-0001", "94");
    Person out = w.participant("나미배정", "010-3000-0002", "95");
    String g1 = createGroup(w, "1조");
    assign(w, change(in.id, null, g1));
    long version = boardVersion(w);
    int audits = auditCount(w.eventId);
    problem(
            publishRequest(w, "{\"expectedBoardVersion\":" + version + "}"),
            409,
            "CONFIRMATION_REQUIRED")
        .andExpect(jsonPath("$.unassignedCount").value(1));
    problem(
            publishRequest(
                w, "{\"expectedBoardVersion\":" + version + ",\"confirmUnassigned\":false}"),
            409,
            "CONFIRMATION_REQUIRED")
        .andExpect(jsonPath("$.unassignedCount").value(1));
    assertThat(publicationCount(w)).isEqualTo(1);
    assertThat(auditCount(w.eventId)).isEqualTo(audits);

    JsonNode done = publish(w, version, true);
    assertThat(done.get("result").asString()).isEqualTo("PUBLISHED");
    assertThat(done.get("assignedCount").asLong()).isEqualTo(1);
    assertThat(done.get("unassignedCount").asLong()).isEqualTo(1);

    JsonNode unassigned = myGroup(out);
    assertThat(unassigned.propertyNames())
        .containsExactly("status", "publishedAt", "group", "leader", "members");
    assertThat(unassigned.get("status").asString()).isEqualTo("UNASSIGNED");
    assertThat(unassigned.get("publishedAt").asString())
        .isEqualTo(done.get("publishedAt").asString());
    assertThat(unassigned.get("group").isNull()).isTrue();
    assertThat(unassigned.get("leader").asBoolean()).isFalse();
    assertThat(unassigned.get("members").isNull()).isTrue();

    // A new applicant after the publication is unassigned in the published view.
    Person late = w.participant("다늦은", "010-3000-0003", "96");
    JsonNode view = published(w);
    assertThat(names(view.get("unassigned"))).containsExactly("나미배정", "다늦은");
    assertThat(view.get("unassigned").get(0).propertyNames())
        .containsExactly("participantId", "name", "cohort");
    assertThat(myGroup(late).get("status").asString()).isEqualTo("UNASSIGNED");

    // Body checks.
    problem(publishRequest(w, "{}"), 400, BAD)
        .andExpect(jsonPath("$.errors[0].field").value("expectedBoardVersion"));
    problem(publishRequest(w, null), 400, BAD);
    problem(publishRequest(w, "{\"expectedBoardVersion\":\"1\"}"), 400, BAD);
    problem(publishRequest(w, "{\"expectedBoardVersion\":-1}"), 400, BAD);
    problem(
            publishRequest(
                w, "{\"expectedBoardVersion\":" + version + ",\"confirmUnassigned\":\"yes\"}"),
            400,
            BAD)
        .andExpect(jsonPath("$.errors[0].field").value("confirmUnassigned"));
  }

  @Test
  void onlyALeaderSeesTheMembersOfTheirOwnGroup() throws Exception {
    World w = world();
    Person lead = w.participant("가조장", "010-4000-0001", "90");
    Person mate = w.participant("나조원", "010-4000-0002", "91");
    Person quit = w.participant("라철회", "010-4000-0003", "92");
    Person quitLead = w.participant("마철회조장", "010-4000-0004", "93");
    Person otherLead = w.participant("바남조장", "010-4000-0005", "94");
    Person otherMate = w.participant("사남조원", "010-4000-0006", "95");
    String g1 = createGroup(w, "1조");
    String g2 = createGroup(w, "2조");
    assign(
        w,
        change(lead.id, null, g1),
        change(mate.id, null, g1),
        change(quit.id, null, g1),
        change(quitLead.id, null, g1),
        change(otherLead.id, null, g2),
        change(otherMate.id, null, g2));
    ok(leaders(w, g1, 0, lead.id));
    ok(leaders(w, g2, 0, otherLead.id));
    publish(w, boardVersion(w), false);
    w.withdraw(quit.id);
    w.withdraw(quitLead.id);

    String plainBody = myGroupBody(mate);
    JsonNode plain = json.readTree(plainBody);
    assertThat(plain.get("status").asString()).isEqualTo("ASSIGNED");
    assertThat(plain.get("group").propertyNames()).containsExactly("name", "leaders");
    assertThat(plain.get("group").get("name").asString()).isEqualTo("1조");
    assertThat(names(plain.get("group").get("leaders"))).containsExactly("가조장");
    assertThat(plain.get("group").get("leaders").get(0).propertyNames()).containsExactly("name");
    assertThat(plain.get("leader").asBoolean()).isFalse();
    assertThat(plain.get("members").isNull()).isTrue();
    assertThat(plainBody)
        .doesNotContain("라철회")
        .doesNotContain("마철회조장")
        .doesNotContain("바남조장")
        .doesNotContain("사남조원")
        .doesNotContain("010-")
        .doesNotContain(mate.id.toString());

    String leadBody = myGroupBody(lead);
    JsonNode leader = json.readTree(leadBody);
    assertThat(leader.get("leader").asBoolean()).isTrue();
    JsonNode members = leader.get("members");
    assertThat(names(members)).containsExactly("가조장", "나조원");
    assertThat(members.get(0).propertyNames()).containsExactly("name", "cohort", "leader");
    assertThat(members.get(0).get("leader").asBoolean()).isTrue();
    assertThat(members.get(1).get("cohort").asString()).isEqualTo("91");
    assertThat(members.get(1).get("leader").asBoolean()).isFalse();
    assertThat(leadBody)
        .doesNotContain("라철회")
        .doesNotContain("마철회조장")
        .doesNotContain("바남조장")
        .doesNotContain("사남조원")
        .doesNotContain("010-")
        .doesNotContain("participantId");

    String otherBody = myGroupBody(otherLead);
    assertThat(names(json.readTree(otherBody).get("members"))).containsExactly("바남조장", "사남조원");
    assertThat(otherBody).doesNotContain("가조장").doesNotContain("나조원");

    JsonNode gone = myGroup(quit);
    assertThat(gone.get("status").asString()).isEqualTo("NOT_ELIGIBLE");
    assertThat(gone.get("publishedAt").isNull()).isTrue();
    assertThat(gone.get("group").isNull()).isTrue();
    assertThat(myGroup(quitLead).get("status").asString()).isEqualTo("NOT_ELIGIBLE");

    // The operator view leaves withdrawn people out and lists leaders first, then names.
    JsonNode view = published(w);
    JsonNode first = view.get("groups").get(0);
    assertThat(first.propertyNames()).containsExactly("groupId", "name", "leaders", "members");
    assertThat(first.get("groupId").asString()).isEqualTo(g1);
    assertThat(names(first.get("leaders"))).containsExactly("가조장");
    assertThat(first.get("leaders").get(0).propertyNames())
        .containsExactly("participantId", "name");
    assertThat(names(first.get("members"))).containsExactly("가조장", "나조원");
    assertThat(first.get("members").get(0).propertyNames())
        .containsExactly("participantId", "name", "cohort", "leader");
    JsonNode second = view.get("groups").get(1);
    assertThat(names(second.get("members"))).containsExactly("바남조장", "사남조원");
    assertThat(view.get("unassigned").size()).isZero();
    assertThat(view.toString()).doesNotContain("010-").doesNotContain("철회");

    // Withdrawing later makes a member not eligible as well.
    w.withdraw(mate.id);
    assertThat(myGroup(mate).get("status").asString()).isEqualTo("NOT_ELIGIBLE");
  }

  @Test
  void publicationsKeepTheOperatorMemberOrderAndAnOrderChangeIsUnpublished() throws Exception {
    World w = world();
    Person lead = w.participant("가조장", "010-4100-0001", "90");
    Person mate = w.participant("나조원", "010-4100-0002", "91");
    Person third = w.participant("다조원", "010-4100-0003", "92");
    String g1 = createGroup(w, "1조");
    assign(w, change(lead.id, null, g1), change(mate.id, null, g1), change(third.id, null, g1));
    ok(memberOrder(w, g1, third.id, lead.id, mate.id));
    ok(leaders(w, g1, 0, lead.id));
    publish(w, boardVersion(w), false);

    // The operator order, not leader first and not by name.
    JsonNode first = published(w).get("groups").get(0);
    assertThat(names(first.get("members"))).containsExactly("다조원", "가조장", "나조원");
    assertThat(names(first.get("leaders"))).containsExactly("가조장");
    assertThat(names(myGroup(lead).get("members"))).containsExactly("다조원", "가조장", "나조원");

    // Order only is an unpublished change of that group.
    ok(memberOrder(w, g1, lead.id, mate.id, third.id));
    JsonNode summary = board(w).get("publication");
    assertThat(summary.get("changedParticipantCount").asLong()).isZero();
    assertThat(summary.get("groupChanges").asLong()).isEqualTo(1);
    assertThat(summary.get("hasUnpublishedChanges").asBoolean()).isTrue();
    assertThat(names(myGroup(lead).get("members"))).containsExactly("다조원", "가조장", "나조원");
    JsonNode second = publish(w, boardVersion(w), false);
    assertThat(second.get("result").asString()).isEqualTo("PUBLISHED");
    assertThat(second.get("changedParticipantCount").asLong()).isZero();
    assertThat(names(published(w).get("groups").get(0).get("members")))
        .containsExactly("가조장", "나조원", "다조원");
    assertThat(names(myGroup(lead).get("members"))).containsExactly("가조장", "나조원", "다조원");
  }

  @Test
  void newcomerAnswersStayOnTheBoardAndNeverReachParticipantReads() throws Exception {
    World w = world();
    UUID newcomer =
        w.preset(
            "MIDDLE_GROUP",
            "DROPDOWN",
            "{\"options\":[{\"optionId\":\"opt_mg_a\",\"label\":\"청년1부\",\"group\":null,\"hidden\":false,\"showWhen\":null},{\"optionId\":\"opt_newcomer\",\"label\":\"처음이에요\",\"group\":null,\"hidden\":false,\"showWhen\":null}]}");
    Person lead = w.participant("가조장", "010-4100-0001", "90");
    Person mate = w.participant("나새가족", "010-4100-0002", "91");
    w.answer(lead.id, newcomer, "{\"optionId\":\"opt_mg_a\"}");
    w.answer(mate.id, newcomer, "{\"optionId\":\"opt_newcomer\"}");
    String g1 = createGroup(w, "1조");
    assign(w, change(lead.id, null, g1), change(mate.id, null, g1));
    ok(leaders(w, g1, 0, lead.id));
    publish(w, boardVersion(w), false);

    assertThat(item(board(w).get("participants"), mate.id).get("newcomer").asBoolean()).isTrue();
    String plainBody = myGroupBody(mate);
    String leadBody = myGroupBody(lead);
    assertThat(json.readTree(leadBody).get("members").size()).isEqualTo(2);
    assertThat(plainBody).doesNotContain("newcomer").doesNotContain("처음이에요");
    assertThat(leadBody).doesNotContain("newcomer").doesNotContain("처음이에요").contains("나새가족");
    assertThat(json.readTree(leadBody).get("members").get(1).propertyNames())
        .containsExactly("name", "cohort", "leader");
    // The operator's published view (EVENT_READ) does not carry it either.
    assertThat(published(w).toString()).doesNotContain("newcomer");
  }

  @Test
  void sessionsAndPermissionsGateEveryPath() throws Exception {
    World w = world();
    Person p = w.participant("가참가", "010-5000-0001", "94");
    String g1 = createGroup(w, "1조");
    assign(w, change(p.id, null, g1));

    mvc.perform(get(MY_GROUP))
        .andExpect(status().isUnauthorized())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
    mvc.perform(get(MY_GROUP).cookie(new Cookie(PARTICIPANT_COOKIE, "not-a-session")))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
    // The operator session is not a participant session.
    mvc.perform(get(MY_GROUP).cookie(w.owner))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));

    long version = boardVersion(w);
    for (String role : List.of("MANAGER", "STAFF")) {
      Cookie operator = login(w.operator(role, role));
      problem(
          publishRequest(operator, w, "{\"expectedBoardVersion\":" + version + "}"),
          403,
          "FORBIDDEN");
      problem(publishRequest(operator, w, "{}"), 403, "FORBIDDEN");
      // EVENT_READ is enough for the published view.
      ok(get(publishedPath(w)).cookie(operator));
    }
    UUID grantedId = w.operator("Granted", "STAFF");
    grant(w, grantedId, "GROUP_WRITE");
    assertThat(
            json.readTree(
                    ok(
                        publishRequest(
                            login(grantedId), w, "{\"expectedBoardVersion\":" + version + "}")))
                .get("result")
                .asString())
        .isEqualTo("PUBLISHED");

    for (String spaceRole : List.of("ADMIN", "OWNER")) {
      UUID id = user(spaceRole);
      member(w.spaceId, id, spaceRole);
      Cookie session = login(id);
      assertThat(json.readTree(ok(get(publishedPath(w)).cookie(session))).get("groups").size())
          .isEqualTo(1);
      problem(
          publishRequest(session, w, "{\"expectedBoardVersion\":" + version + "}"),
          403,
          "FORBIDDEN");
    }
    UUID memberId = user("Member");
    member(w.spaceId, memberId, "MEMBER");
    problem(get(publishedPath(w)).cookie(login(memberId)), 403, "FORBIDDEN");

    World elsewhere = world();
    problem(get(publishedPath(w)).cookie(elsewhere.owner), 404, MISSING);
    problem(publishRequest(elsewhere.owner, w, "{\"expectedBoardVersion\":0}"), 404, MISSING);
    problem(
        get("/api/v1/operator/events/" + UUID.randomUUID() + "/groups/published").cookie(w.owner),
        404,
        MISSING);
    // A participant of another event sees only their own event.
    Person stranger = elsewhere.participant("가남", "010-5000-0002", "94");
    assertThat(myGroup(stranger).get("status").asString()).isEqualTo("NOT_PUBLISHED");
  }

  @Test
  void endedAndArchivedEventsBlockPublishingButKeepTheLastPublication() throws Exception {
    World w = world();
    Person p = w.participant("가참가", "010-6000-0001", "94");
    String g1 = createGroup(w, "1조");
    lifecycle(w.eventId, "DRAFT");
    assign(w, change(p.id, null, g1));
    JsonNode draft = publish(w, boardVersion(w), false);
    assertThat(draft.get("result").asString()).isEqualTo("PUBLISHED");

    for (String[] state :
        List.of(
            new String[] {"ENDED", "EVENT_ENDED"}, new String[] {"ARCHIVED", "EVENT_ARCHIVED"})) {
      lifecycle(w.eventId, state[0]);
      long version = boardVersion(w);
      problem(publishRequest(w, "{\"expectedBoardVersion\":" + version + "}"), 409, state[1]);
      // The state comes before the board version, and the body before the state.
      problem(publishRequest(w, "{\"expectedBoardVersion\":" + (version + 7) + "}"), 409, state[1]);
      problem(publishRequest(w, "{}"), 400, BAD);
      assertThat(groupNames(published(w))).containsExactly("1조");
      JsonNode mine = myGroup(p);
      assertThat(mine.get("status").asString()).isEqualTo("ASSIGNED");
      assertThat(mine.get("group").get("name").asString()).isEqualTo("1조");
      assertThat(board(w).get("publication").get("hasUnpublishedChanges").asBoolean()).isFalse();
    }
    assertThat(publicationCount(w)).isEqualTo(1);
  }

  @Test
  void snapshotAuditAndLogsCarryNoNameOrPhone() throws Exception {
    ListAppender<ILoggingEvent> logs = new ListAppender<>();
    logs.start();
    Logger app = (Logger) LoggerFactory.getLogger("app.scene");
    app.addAppender(logs);
    try {
      World w = world();
      String name = "홍길동비밀이름";
      String phone = "010-9876-5432";
      Person p = w.participant(name, phone, "94");
      Person q = w.participant("김비밀조원", "010-1111-2222", "95");
      String g1 = createGroup(w, "1조");
      assign(w, change(p.id, null, g1), change(q.id, null, g1));
      ok(leaders(w, g1, 0, p.id));
      publish(w, boardVersion(w), false);
      myGroup(p);
      myGroup(q);
      published(w);

      String snapshot =
          jdbc.queryForObject(
              "SELECT row_to_json(gp)::text FROM group_publications gp WHERE event_id = ?",
              String.class,
              w.eventId);
      assertThat(snapshot).contains(p.id.toString()).contains(q.id.toString()).contains("1조");
      String audit =
          String.join(
              "\n",
              jdbc.queryForList(
                  "SELECT row_to_json(a)::text FROM audit_logs a WHERE event_id = ?",
                  String.class,
                  w.eventId));
      for (String text : List.of(snapshot, audit)) {
        assertThat(text)
            .doesNotContain(name)
            .doesNotContain(phone)
            .doesNotContain("5432")
            .doesNotContain("김비밀조원")
            .doesNotContain("2222");
      }
      for (ILoggingEvent logged : logs.list) {
        assertThat(logged.getFormattedMessage())
            .doesNotContain(name)
            .doesNotContain(phone)
            .doesNotContain("김비밀조원");
      }
    } finally {
      app.detachAppender(logs);
    }
  }

  private JsonNode publish(World w, long version, boolean confirm) throws Exception {
    return json.readTree(
        ok(
            publishRequest(
                w,
                "{\"expectedBoardVersion\":"
                    + version
                    + ",\"confirmUnassigned\":"
                    + confirm
                    + "}")));
  }

  private MockHttpServletRequestBuilder publishRequest(World w, String body) {
    return publishRequest(w.owner, w, body);
  }

  private MockHttpServletRequestBuilder publishRequest(Cookie session, World w, String body) {
    return write(post(groupsPath(w) + "/publish"), session, body);
  }

  private JsonNode published(World w) throws Exception {
    return json.readTree(ok(get(publishedPath(w)).cookie(w.owner)));
  }

  private static String publishedPath(World w) {
    return groupsPath(w) + "/published";
  }

  private JsonNode myGroup(Person p) throws Exception {
    return json.readTree(myGroupBody(p));
  }

  private String myGroupBody(Person p) throws Exception {
    return mvc.perform(get(MY_GROUP).cookie(p.session))
        .andExpect(status().isOk())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
        .andReturn()
        .getResponse()
        .getContentAsString();
  }

  private int publicationCount(World w) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM group_publications WHERE event_id = ?", Integer.class, w.eventId);
  }

  private static List<String> groupNames(JsonNode view) {
    List<String> out = new ArrayList<>();
    for (JsonNode group : view.get("groups")) {
      out.add(group.get("name").asString());
    }
    return out;
  }

  private record Person(UUID id, Cookie session) {}

  private JsonNode board(World w) throws Exception {
    return json.readTree(ok(get(boardPath(w)).cookie(w.owner)));
  }

  private long boardVersion(World w) throws Exception {
    return board(w).get("boardVersion").asLong();
  }

  private String createGroup(World w, String name) throws Exception {
    String body = json.writeValueAsString(Map.of("name", name));
    return json.readTree(created(write(post(groupsPath(w)), w.owner, body)))
        .get("group")
        .get("groupId")
        .asString();
  }

  private MockHttpServletRequestBuilder rename(World w, String groupId, String name, int version) {
    return rename(w.owner, w, groupId, name, version);
  }

  private MockHttpServletRequestBuilder rename(
      Cookie session, World w, String groupId, String name, int version) {
    String body = json.writeValueAsString(Map.of("name", name, "expectedVersion", version));
    return write(patch(groupPath(w, groupId)), session, body);
  }

  private MockHttpServletRequestBuilder leaders(World w, String groupId, int version, UUID... ids) {
    return leaders(w.owner, w, groupId, version, ids);
  }

  private MockHttpServletRequestBuilder leaders(
      Cookie session, World w, String groupId, int version, UUID... ids) {
    List<String> list = new ArrayList<>();
    for (UUID id : ids) {
      list.add(id.toString());
    }
    String body =
        json.writeValueAsString(Map.of("participantIds", list, "expectedVersion", version));
    return write(put(groupPath(w, groupId) + "/leaders"), session, body);
  }

  private MockHttpServletRequestBuilder memberOrder(World w, String groupId, UUID... ids) {
    List<String> list = new ArrayList<>();
    for (UUID id : ids) {
      list.add(id.toString());
    }
    String body = json.writeValueAsString(Map.of("participantIds", list));
    return write(put(groupPath(w, groupId) + "/members/order"), w.owner, body);
  }

  private JsonNode assign(World w, String... changes) throws Exception {
    return assignRequestOk(w.owner, w, changes);
  }

  private JsonNode assignRequestOk(Cookie session, World w, String... changes) throws Exception {
    return json.readTree(ok(assignRequest(session, w, changes)));
  }

  private MockHttpServletRequestBuilder assignRequest(Cookie session, World w, String... changes) {
    return write(
        post("/api/v1/operator/events/" + w.eventId + "/group-assignments"),
        session,
        "{\"changes\":[" + String.join(",", changes) + "]}");
  }

  private static String change(UUID participantId, String from, String to) {
    return "{\"participantId\":\""
        + participantId
        + "\",\"fromGroupId\":"
        + quoted(from)
        + ",\"toGroupId\":"
        + quoted(to)
        + "}";
  }

  private static String quoted(String value) {
    return value == null ? "null" : "\"" + value + "\"";
  }

  private static JsonNode item(JsonNode list, UUID participantId) {
    for (JsonNode item : list) {
      if (item.get("participantId").asString().equals(participantId.toString())) {
        return item;
      }
    }
    throw new AssertionError("participant is not on the board");
  }

  private static List<String> names(JsonNode list) {
    List<String> names = new ArrayList<>();
    for (JsonNode item : list) {
      names.add(item.get("name").asString());
    }
    return names;
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
        .getContentAsString();
  }

  private String created(MockHttpServletRequestBuilder request) throws Exception {
    return mvc.perform(request)
        .andExpect(status().isCreated())
        .andReturn()
        .getResponse()
        .getContentAsString();
  }

  private ResultActions problem(MockHttpServletRequestBuilder request, int httpStatus, String code)
      throws Exception {
    String requestId = "req-" + UUID.randomUUID();
    return mvc.perform(request.header("X-Request-Id", requestId))
        .andExpect(status().is(httpStatus))
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.code").value(code))
        .andExpect(jsonPath("$.traceId").value(requestId))
        .andExpect(header().string("X-Request-Id", requestId));
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

  /** A space with an ACTIVE event created by its owner, plus a form with the 또래 question. */
  private World world() throws Exception {
    UUID spaceId = UUID.randomUUID();
    jdbc.update("INSERT INTO spaces (id, name) VALUES (?, 'Home')", spaceId);
    UUID ownerId = user("Owner");
    member(spaceId, ownerId, "MEMBER");
    Cookie owner = login(ownerId);
    String created =
        mvc.perform(
                post("/api/v1/operator/spaces/" + spaceId + "/events")
                    .cookie(owner, csrf())
                    .header(CSRF_HEADER, CSRF)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"name\":\"수련회\"}"))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    UUID eventId = UUID.fromString(json.readTree(created).get("eventId").asString());
    lifecycle(eventId, "ACTIVE");
    UUID formId =
        jdbc.queryForList("SELECT id FROM forms WHERE event_id = ?", UUID.class, eventId).stream()
            .findFirst()
            .orElse(null);
    if (formId == null) {
      formId = UUID.randomUUID();
      jdbc.update(
          "INSERT INTO forms (id, space_id, event_id) VALUES (?, ?, ?)", formId, spaceId, eventId);
    }
    UUID cohortField =
        jdbc
            .queryForList(
                "SELECT id FROM fields WHERE form_id = ? AND system_key = 'COHORT'",
                UUID.class,
                formId)
            .stream()
            .findFirst()
            .orElse(null);
    if (cohortField == null) {
      cohortField = UUID.randomUUID();
      jdbc.update(
          """
          INSERT INTO fields (
            id, space_id, event_id, form_id, kind, system_key, label, position, required)
          VALUES (?, ?, ?, ?, 'SYSTEM', 'COHORT', '또래',
            (SELECT coalesce(max(position), -1) + 1 FROM fields WHERE form_id = ?), true)
          """,
          cohortField,
          spaceId,
          eventId,
          formId,
          formId);
    }
    return new World(spaceId, eventId, formId, cohortField, owner, ownerId);
  }

  private void lifecycle(UUID eventId, String status) {
    jdbc.update("UPDATE events SET lifecycle_status = ? WHERE id = ?", status, eventId);
  }

  private void grant(World w, UUID userId, String permission) {
    jdbc.update(
        """
        INSERT INTO event_user_permissions (
          space_id, event_id, user_id, permission, effect, granted_by, granted_at)
        VALUES (?, ?, ?, ?, 'GRANT', ?, now())
        """,
        w.spaceId,
        w.eventId,
        userId,
        permission,
        w.ownerId);
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

  private static String boardPath(World w) {
    return "/api/v1/operator/events/" + w.eventId + "/group-board";
  }

  private static String groupsPath(World w) {
    return "/api/v1/operator/events/" + w.eventId + "/groups";
  }

  private static String groupPath(World w, String groupId) {
    return groupsPath(w) + "/" + groupId;
  }

  private int auditCount(UUID eventId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_logs WHERE event_id = ?", Integer.class, eventId);
  }

  private final class World {
    final UUID spaceId;
    final UUID eventId;
    final UUID formId;
    final UUID cohortField;
    final Cookie owner;
    final UUID ownerId;
    final Map<UUID, UUID> applications = new LinkedHashMap<>();

    World(UUID spaceId, UUID eventId, UUID formId, UUID cohortField, Cookie owner, UUID ownerId) {
      this.spaceId = spaceId;
      this.eventId = eventId;
      this.formId = formId;
      this.cohortField = cohortField;
      this.owner = owner;
      this.ownerId = ownerId;
    }

    UUID operator(String name, String role) {
      UUID id = user(name);
      member(spaceId, id, "MEMBER");
      jdbc.update(
          "INSERT INTO event_users (space_id, event_id, user_id, role) VALUES (?, ?, ?, ?)",
          spaceId,
          eventId,
          id,
          role);
      return id;
    }

    /** A generated question of the form with {@code key}. */
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

    void answer(UUID participantId, UUID fieldId, String value) {
      jdbc.update(
          """
          INSERT INTO answers (id, space_id, event_id, application_id, field_id, value)
          VALUES (?, ?, ?, ?, ?, ?::jsonb)
          """,
          UUID.randomUUID(),
          spaceId,
          eventId,
          applications.get(participantId),
          fieldId,
          value);
    }

    void withdraw(UUID participantId) {
      jdbc.update(
          "UPDATE applications SET status = 'WITHDRAWN' WHERE participant_id = ?", participantId);
    }

    /**
     * A participant with one SUBMITTED application, an access key, and a signed-in participant
     * session. A null cohort stores no 또래 answer.
     */
    Person participant(String name, String phone, String cohort) throws Exception {
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
          VALUES (?, ?, ?, ?, 'SUBMITTED', now(), ?)
          """,
          applicationId,
          spaceId,
          eventId,
          formId,
          id);
      applications.put(id, applicationId);
      if (cohort != null) {
        answer(id, cohortField, "{\"text\":\"" + cohort + "\"}");
      }
      String accessKey = "access-" + UUID.randomUUID();
      return new Person(id, session(id));
    }

    /** Opens a participant session for an inserted participant (DEC-078 sign-in is elsewhere). */
    Cookie session(UUID participantId) {
      return ParticipantSessions.open(jdbc, spaceId, eventId, participantId);
    }
  }
}
