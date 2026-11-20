package app.scene.event.home;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.common.error.SceneException;
import app.scene.event.audience.Audience;
import app.scene.event.audience.AudienceType;
import app.scene.event.audience.ParticipantAudience;
import app.scene.event.feed.FeedArea;
import app.scene.event.feed.ParticipantFeedVersions;
import app.scene.event.home.ParticipantFeedFixture.Person;
import app.scene.event.home.ParticipantFeedFixture.World;
import app.scene.event.notification.NotificationDraft;
import app.scene.event.notification.Notifications;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Participant home, refresh values, audience, and notifications (DEC-080, participant-home-contract
 * §10, #423).
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class ParticipantHomeHttpIT {

  private static final String HOME = "/api/v1/participant/home";
  private static final String UPDATES = "/api/v1/participant/updates";
  private static final String NOTIFICATIONS = "/api/v1/participant/notifications";
  private static final String READ = "/api/v1/participant/notifications/read";

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;
  @Autowired TransactionTemplate tx;
  @Autowired ParticipantFeedVersions feedVersions;
  @Autowired Notifications notifications;
  @Autowired ParticipantAudience audience;

  ParticipantFeedFixture f;
  MockMvc mvc;

  @BeforeEach
  void setUp() {
    f = new ParticipantFeedFixture(context, jdbc, json);
    mvc = f.mvc;
  }

  @Test
  void groupsRiseOnlyWhenAPublicationIsMade() throws Exception {
    World w = f.world("RETREAT");
    Person a = w.participant("가나다", "010-3000-0001");
    assertThat(f.updates(a).get("group").asLong()).isZero();

    String g1 = w.createGroup("1조");
    w.assign(a.id(), null, g1);
    assertThat(f.updates(a).get("group").asLong()).isZero();

    assertThat(w.publish()).isEqualTo("PUBLISHED");
    assertThat(f.updates(a).get("group").asLong()).isEqualTo(1);
    assertThat(w.publish()).isEqualTo("ALREADY_PUBLISHED");
    assertThat(f.updates(a).get("group").asLong()).isEqualTo(1);

    // Working-copy edits do not raise it; the next publication does.
    String g2 = w.createGroup("2조");
    w.assign(a.id(), g1, g2);
    assertThat(f.updates(a).get("group").asLong()).isEqualTo(1);
    assertThat(w.publish()).isEqualTo("PUBLISHED");
    assertThat(f.updates(a).get("group").asLong()).isEqualTo(2);
    // Other areas did not move.
    JsonNode u = f.updates(a);
    assertThat(u.get("home").asLong()).isZero();
    assertThat(u.get("schedule").asLong()).isZero();
    assertThat(u.get("notices").asLong()).isZero();
  }

  @Test
  void aFailedPublicationLeavesTheValueAlone() throws Exception {
    World w = f.world("RETREAT");
    Person a = w.participant("가나다", "010-3000-0002");
    w.assign(a.id(), null, w.createGroup("1조"));
    // Fails the publish transaction after the publication row and the bump are written.
    String fn = "fail_publish_" + w.eventId.toString().replace("-", "");
    jdbc.execute(
        "CREATE FUNCTION "
            + fn
            + "() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_id = '"
            + w.eventId
            + "' AND NEW.action = 'GROUPS_PUBLISHED' THEN RAISE EXCEPTION 'boom'; END IF;"
            + " RETURN NEW; END $$");
    jdbc.execute(
        "CREATE TRIGGER "
            + fn
            + " BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION "
            + fn
            + "()");
    try {
      long version = w.board().get("boardVersion").asLong();
      mvc.perform(
              ParticipantFeedFixture.write(post(w.path("/groups/publish")), w.owner)
                  .content("{\"expectedBoardVersion\":" + version + "}"))
          .andExpect(status().is5xxServerError());
    } finally {
      jdbc.execute("DROP TRIGGER " + fn + " ON audit_logs");
      jdbc.execute("DROP FUNCTION " + fn + "()");
    }
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM group_publications WHERE event_id = ?",
                Integer.class,
                w.eventId))
        .isZero();
    assertThat(f.updates(a).get("group").asLong()).isZero();
    assertThat(w.publish()).isEqualTo("PUBLISHED");
    assertThat(f.updates(a).get("group").asLong()).isEqualTo(1);
  }

  @Test
  void bumpJoinsTheCallersTransactionOnly() throws Exception {
    World w = f.world(null);
    tx.executeWithoutResult(
        status -> {
          feedVersions.bump(w.spaceId, w.eventId, FeedArea.SCHEDULE);
          status.setRollbackOnly();
        });
    assertThat(feedVersions.read(w.spaceId, w.eventId).schedule()).isZero();
    tx.executeWithoutResult(
        status -> {
          feedVersions.bump(w.spaceId, w.eventId, FeedArea.SCHEDULE);
          feedVersions.bump(w.spaceId, w.eventId, FeedArea.SCHEDULE);
          feedVersions.bump(w.spaceId, w.eventId, FeedArea.MEAL_ORDER);
        });
    assertThat(feedVersions.read(w.spaceId, w.eventId).schedule()).isEqualTo(2);
    assertThat(feedVersions.read(w.spaceId, w.eventId).mealOrder()).isEqualTo(1);
    assertThatThrownBy(() -> feedVersions.bump(w.spaceId, w.eventId, FeedArea.NOTICES))
        .isInstanceOf(IllegalTransactionStateException.class);
  }

  @Test
  void homeRisesForEventNameLifecycleAndCompletionNotice() throws Exception {
    World w = f.world("RETREAT");
    Person a = w.participant("가나다", "010-3000-0003");
    assertThat(f.updates(a).get("home").asLong()).isZero();

    mvc.perform(
            ParticipantFeedFixture.write(patch(w.path("")), w.owner)
                .content("{\"name\":\"2027 겨울수련회\"}"))
        .andExpect(status().isOk());
    assertThat(f.updates(a).get("home").asLong()).isEqualTo(1);

    mvc.perform(
            ParticipantFeedFixture.write(
                    put(w.path("/forms/" + w.formId + "/completion-notice")), w.owner)
                .content("{\"completionNotice\":\"참가비 계좌: 신한 110\"}"))
        .andExpect(status().isOk());
    assertThat(f.updates(a).get("home").asLong()).isEqualTo(2);

    mvc.perform(
            ParticipantFeedFixture.write(post(w.path("/end")), w.owner)
                .content("{\"expectedLifecycleVersion\":0}"))
        .andExpect(status().isOk());
    JsonNode home = f.read(HOME, a.session());
    assertThat(home.get("updates").get("home").asLong()).isEqualTo(3);
    assertThat(home.get("event").get("name").asString()).isEqualTo("2027 겨울수련회");
    assertThat(home.get("event").get("status").asString()).isEqualTo("ENDED");
    assertThat(home.get("completionNotice").asString()).isEqualTo("참가비 계좌: 신한 110");

    // The same state again changes nothing.
    mvc.perform(
            ParticipantFeedFixture.write(post(w.path("/end")), w.owner)
                .content("{\"expectedLifecycleVersion\":1}"))
        .andExpect(jsonPath("$.outcome").value("ALREADY_IN_STATE"));
    assertThat(f.updates(a).get("home").asLong()).isEqualTo(3);
  }

  @Test
  void homeShowsTheEventTheParticipantAndTheAreas() throws Exception {
    World w = f.world("RETREAT");
    Person a = w.participant("가나다", "010-3000-0004");
    w.participant("라마바", "010-3000-0005");
    String body =
        mvc.perform(get(HOME).cookie(a.session()))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store"))
            .andReturn()
            .getResponse()
            .getContentAsString();
    JsonNode home = json.readTree(body);
    assertThat(home.propertyNames())
        .containsExactly("event", "participant", "completionNotice", "features", "updates");
    assertThat(home.get("event").propertyNames())
        .containsExactly("eventId", "name", "status", "startDate", "endDate", "place", "timeZone");
    assertThat(home.get("event").get("startDate").asString()).isEqualTo("2027-01-22");
    assertThat(home.get("event").get("place").asString()).isEqualTo("양평");
    assertThat(home.get("event").get("timeZone").asString()).isEqualTo("Asia/Seoul");
    assertThat(home.get("participant").get("name").asString()).isEqualTo("가나다");
    assertThat(home.get("participant").get("applicationStatus").asString()).isEqualTo("SUBMITTED");
    assertThat(home.get("completionNotice").isNull()).isTrue();
    JsonNode features = home.get("features");
    assertThat(features.propertyNames())
        .containsExactly("schedule", "notices", "groups", "rooms", "mealOrder");
    assertThat(features.get("schedule").asBoolean()).isTrue();
    assertThat(features.get("notices").asBoolean()).isTrue();
    assertThat(features.get("groups").asBoolean()).isTrue();
    assertThat(features.get("rooms").asBoolean()).isTrue();
    // Meal order is out of the January scope (DEC-086 on hold): never on by type default.
    assertThat(features.get("mealOrder").asBoolean()).isFalse();
    assertThat(home.get("updates").propertyNames())
        .containsExactly(
            "home",
            "schedule",
            "notices",
            "group",
            "rooms",
            "mealOrder",
            "checkIn",
            "application",
            "notifications",
            "pollAfterSeconds",
            "serverTime");
    assertNoPrivateValues(body, a, "라마바", "010-3000-0005");

    // Other types: schedule and notices only, until something is published in an area.
    World other = f.world("WORKSHOP");
    Person b = other.participant("사아자", "010-3000-0006");
    JsonNode off = f.read(HOME, b.session()).get("features");
    assertThat(off.get("schedule").asBoolean()).isTrue();
    assertThat(off.get("notices").asBoolean()).isTrue();
    assertThat(off.get("groups").asBoolean()).isFalse();
    assertThat(off.get("rooms").asBoolean()).isFalse();
    assertThat(off.get("mealOrder").asBoolean()).isFalse();
    other.assign(b.id(), null, other.createGroup("1조"));
    other.publish();
    assertThat(f.read(HOME, b.session()).get("features").get("groups").asBoolean()).isTrue();
    tx.executeWithoutResult(s -> feedVersions.bump(other.spaceId, other.eventId, FeedArea.ROOMS));
    assertThat(f.read(HOME, b.session()).get("features").get("rooms").asBoolean()).isTrue();
    // Rule 2 still holds for meal order, though nothing bumps it in January.
    tx.executeWithoutResult(
        s -> feedVersions.bump(other.spaceId, other.eventId, FeedArea.MEAL_ORDER));
    assertThat(f.read(HOME, b.session()).get("features").get("mealOrder").asBoolean()).isTrue();

    // A participant whose application is withdrawn but still holds a session is NONE.
    other.withdraw(b);
    assertThat(f.read(HOME, b.session()).get("participant").get("applicationStatus").asString())
        .isEqualTo("NONE");
  }

  @Test
  void updatesCarryTheParticipantsOwnValues() throws Exception {
    World w = f.world("RETREAT");
    Person a = w.participant("가나다", "010-3000-0007");
    Person b = w.participant("라마바", "010-3000-0008");
    String body =
        mvc.perform(get(UPDATES).cookie(a.session()))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store"))
            .andReturn()
            .getResponse()
            .getContentAsString();
    JsonNode u = json.readTree(body);
    assertThat(u.get("checkIn").asLong()).isZero();
    assertThat(u.get("application").asLong()).isEqualTo(1);
    assertThat(u.get("notifications").get("latestSeq").asLong()).isZero();
    assertThat(u.get("notifications").get("unreadCount").asInt()).isZero();
    assertThat(u.get("pollAfterSeconds").asInt()).isEqualTo(30);
    assertThat(u.get("serverTime").asString()).endsWith("Z");
    assertNoPrivateValues(body, a, b.name(), b.phone());

    // A check-in of b moves only b's value.
    UUID checkinId = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO checkins (id, space_id, event_id, participant_id, status, method,"
            + " checked_in_by, checked_in_at) VALUES (?, ?, ?, ?, 'CHECKED_IN', 'MANUAL', ?, now())",
        checkinId,
        w.spaceId,
        w.eventId,
        b.id(),
        w.ownerId);
    jdbc.update(
        "INSERT INTO checkin_logs (id, space_id, event_id, checkin_id, participant_id, action,"
            + " method, actor_user_id, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?,"
            + " 'CHECKED_IN', 'MANUAL', ?, ?, now())",
        UUID.randomUUID(),
        w.spaceId,
        w.eventId,
        checkinId,
        b.id(),
        w.ownerId,
        "k-" + UUID.randomUUID());
    assertThat(f.updates(b).get("checkIn").asLong()).isPositive();
    assertThat(f.updates(a).get("checkIn").asLong()).isZero();
  }

  @Test
  void temporaryNumberAndMissingSessions() throws Exception {
    World w = f.world("RETREAT");
    Person a = w.participant("가나다", "010-3000-0009");
    jdbc.update("UPDATE participants SET pin_temporary = true WHERE id = ?", a.id());
    for (MockHttpServletRequestBuilder request : paths(a.session())) {
      mvc.perform(request)
          .andExpect(status().isForbidden())
          .andExpect(jsonPath("$.code").value("PARTICIPANT_PIN_CHANGE_REQUIRED"));
    }
    for (MockHttpServletRequestBuilder request : paths(null)) {
      mvc.perform(request)
          .andExpect(status().isUnauthorized())
          .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
    }
    for (MockHttpServletRequestBuilder request : paths(new Cookie("SCENE_PSESSION", "nope"))) {
      mvc.perform(request).andExpect(status().isUnauthorized());
    }
    // POST without CSRF is refused before anything else.
    mvc.perform(
            post(READ)
                .cookie(a.session())
                .contentType("application/json")
                .content("{\"upToSeq\":1}"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("FORBIDDEN"));
  }

  @Test
  void notificationsMergeListAndRead() throws Exception {
    World w = f.world("RETREAT");
    Person a = w.participant("가나다", "010-3000-0010");
    Person b = w.participant("라마바", "010-3000-0011");
    UUID notice = UUID.randomUUID();
    NotificationDraft draft =
        new NotificationDraft("NOTICE_PUBLISHED", "NOTICE", notice, "새 공지", "집회 장소 변경", true);

    int made =
        tx.execute(
            s ->
                notifications.toParticipants(w.spaceId, w.eventId, List.of(a.id(), b.id()), draft));
    assertThat(made).isEqualTo(2);
    tx.executeWithoutResult(
        s ->
            notifications.toParticipants(
                w.spaceId,
                w.eventId,
                List.of(a.id()),
                new NotificationDraft(
                    "NOTICE_PUBLISHED", "NOTICE", notice, "새 공지", "고친 제목", true)));
    // Merged: one row for a, count 2, the new text.
    JsonNode page = f.read(NOTIFICATIONS, a.session());
    assertThat(page.propertyNames()).containsExactly("items", "unreadCount", "nextBefore");
    assertThat(page.get("items").size()).isEqualTo(1);
    JsonNode item = page.get("items").get(0);
    assertThat(item.propertyNames())
        .containsExactly(
            "notificationId",
            "seq",
            "kind",
            "target",
            "title",
            "body",
            "important",
            "count",
            "createdAt",
            "readAt");
    assertThat(item.get("count").asInt()).isEqualTo(2);
    assertThat(item.get("body").asString()).isEqualTo("고친 제목");
    assertThat(item.get("target").get("id").asString()).isEqualTo(notice.toString());
    assertThat(item.get("readAt").isNull()).isTrue();
    assertThat(page.get("unreadCount").asInt()).isEqualTo(1);
    assertThat(page.get("nextBefore").isNull()).isTrue();
    JsonNode summary = f.updates(a).get("notifications");
    assertThat(summary.get("latestSeq").asLong()).isEqualTo(item.get("seq").asLong());
    assertThat(summary.get("unreadCount").asInt()).isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM notifications WHERE recipient_participant_id = ?",
                Integer.class,
                a.id()))
        .isEqualTo(1);

    // b reading a's id changes nothing and answers like any other id.
    String aId = item.get("notificationId").asString();
    JsonNode other = readOk(b, "{\"notificationIds\":[\"" + aId + "\"]}");
    JsonNode unknown = readOk(b, "{\"notificationIds\":[\"" + UUID.randomUUID() + "\"]}");
    assertThat(other).isEqualTo(unknown);
    assertThat(other.get("unreadCount").asInt()).isEqualTo(1);
    assertThat(f.read(NOTIFICATIONS, a.session()).get("items").get(0).get("readAt").isNull())
        .isTrue();

    // Reading by target; a read row is not merged, a new one starts at count 1.
    assertThat(
            readOk(a, "{\"target\":{\"type\":\"NOTICE\",\"id\":\"" + notice + "\"}}")
                .get("unreadCount")
                .asInt())
        .isZero();
    String readAt = f.read(NOTIFICATIONS, a.session()).get("items").get(0).get("readAt").asString();
    readOk(a, "{\"upToSeq\":" + Long.MAX_VALUE + "}");
    assertThat(f.read(NOTIFICATIONS, a.session()).get("items").get(0).get("readAt").asString())
        .isEqualTo(readAt);
    tx.executeWithoutResult(
        s -> notifications.toParticipants(w.spaceId, w.eventId, List.of(a.id()), draft));
    JsonNode again = f.read(NOTIFICATIONS, a.session());
    assertThat(again.get("items").size()).isEqualTo(2);
    assertThat(again.get("items").get(0).get("count").asInt()).isEqualTo(1);

    // Notice helpers: unread target lookup and archive-time read for everyone.
    assertThat(
            notifications.hasUnread(
                app.scene.event.notification.NotificationRecipient.participant(
                    w.spaceId, w.eventId, b.id()),
                "NOTICE",
                notice))
        .isTrue();
    tx.executeWithoutResult(
        s -> notifications.markTargetReadForAll(w.spaceId, w.eventId, "NOTICE", notice));
    assertThat(f.updates(a).get("notifications").get("unreadCount").asInt()).isZero();
    assertThat(f.updates(b).get("notifications").get("unreadCount").asInt()).isZero();
  }

  @Test
  void notificationPagesAndTheUnreadCap() throws Exception {
    World w = f.world("RETREAT");
    Person a = w.participant("가나다", "010-3000-0012");
    tx.executeWithoutResult(
        s -> {
          for (int i = 0; i < 101; i++) {
            notifications.toParticipants(
                w.spaceId,
                w.eventId,
                List.of(a.id()),
                new NotificationDraft(
                    "SCHEDULE_CHANGED", "SCHEDULE", UUID.randomUUID(), "일정", null, false));
          }
        });
    JsonNode first = f.read(NOTIFICATIONS + "?limit=50", a.session());
    assertThat(first.get("items").size()).isEqualTo(50);
    assertThat(first.get("unreadCount").asInt()).isEqualTo(100);
    long next = first.get("nextBefore").asLong();
    JsonNode second = f.read(NOTIFICATIONS + "?before=" + next + "&limit=50", a.session());
    assertThat(second.get("items").get(0).get("seq").asLong()).isLessThan(next);
    JsonNode third =
        f.read(NOTIFICATIONS + "?before=" + second.get("nextBefore").asLong(), a.session());
    assertThat(third.get("items").size()).isEqualTo(1);
    assertThat(third.get("nextBefore").isNull()).isTrue();
    assertThat(f.read(NOTIFICATIONS, a.session()).get("items").size()).isEqualTo(30);
    assertThat(f.updates(a).get("notifications").get("unreadCount").asInt()).isEqualTo(100);

    for (String bad : List.of("limit=0", "limit=51", "limit=x", "before=0", "before=-1")) {
      mvc.perform(get(NOTIFICATIONS + "?" + bad).cookie(a.session()))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
          .andExpect(jsonPath("$.errors[0].field").value(bad.substring(0, bad.indexOf('='))));
    }
    for (String bad :
        List.of(
            "{}",
            "{\"upToSeq\":1,\"target\":{\"type\":\"NOTICE\",\"id\":\"" + UUID.randomUUID() + "\"}}",
            "{\"notificationIds\":[],\"upToSeq\":1}",
            "{\"notificationIds\":[]}",
            "{\"notificationIds\":[\"x\"]}",
            "{\"upToSeq\":0}",
            "{\"upToSeq\":\"1\"}",
            "{\"target\":{\"type\":\"NOTICE\"}}",
            "{\"other\":1}",
            "[]")) {
      mvc.perform(ParticipantFeedFixture.write(post(READ), a.session()).content(bad))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }
    // Up to the last item of the first page: the 49 newer ones stay unread.
    assertThat(readOk(a, "{\"upToSeq\":" + next + "}").get("unreadCount").asInt()).isEqualTo(49);
  }

  @Test
  void audienceFollowsTheLatestPublicationAndActiveParticipants() throws Exception {
    World w = f.world("RETREAT");
    Person lead = w.participant("가조장", "010-3000-0013");
    Person mate = w.participant("나조원", "010-3000-0014");
    Person gone = w.participant("다취소", "010-3000-0015");
    Audience all = Audience.of(AudienceType.ALL);
    Audience leaders = Audience.of(AudienceType.LEADERS);
    Audience staff = Audience.of(AudienceType.STAFF);
    Audience unknown = Audience.read(json, "[{\"type\":\"GROUP\",\"ids\":[\"x\"]}]");

    // No publication yet: nobody is a leader.
    assertThat(audience.viewer(w.spaceId, w.eventId, lead.id()).sees(leaders)).isFalse();
    assertThat(audience.participantIds(w.spaceId, w.eventId, leaders)).isEmpty();

    String g1 = w.createGroup("1조");
    w.assign(lead.id(), null, g1);
    w.assign(mate.id(), null, g1);
    w.assign(gone.id(), null, g1);
    w.leaders(g1, lead.id());
    // A working-copy leader is not a published leader.
    assertThat(audience.viewer(w.spaceId, w.eventId, lead.id()).sees(leaders)).isFalse();
    w.publish();

    ParticipantAudience.Viewer leadView = audience.viewer(w.spaceId, w.eventId, lead.id());
    ParticipantAudience.Viewer mateView = audience.viewer(w.spaceId, w.eventId, mate.id());
    assertThat(leadView.sees(leaders)).isTrue();
    assertThat(leadView.sees(all)).isTrue();
    assertThat(mateView.sees(leaders)).isFalse();
    assertThat(mateView.sees(all)).isTrue();
    for (ParticipantAudience.Viewer viewer : List.of(leadView, mateView)) {
      assertThat(viewer.sees(staff)).isFalse();
      assertThat(viewer.sees(unknown)).isFalse();
      assertThat(viewer.sees(Audience.read(json, "not json"))).isFalse();
    }
    assertThat(audience.participantIds(w.spaceId, w.eventId, leaders)).containsExactly(lead.id());
    assertThat(audience.participantIds(w.spaceId, w.eventId, staff)).isEmpty();
    assertThat(audience.participantIds(w.spaceId, w.eventId, unknown)).isEmpty();

    // Withdrawn: out of recipients and sees nothing.
    w.withdraw(gone);
    assertThat(audience.participantIds(w.spaceId, w.eventId, all))
        .containsExactlyInAnyOrder(lead.id(), mate.id());
    assertThat(audience.viewer(w.spaceId, w.eventId, gone.id()).sees(all)).isFalse();

    // The leader is cleared and published: no longer a leader.
    w.leaders(g1, mate.id());
    w.publish();
    assertThat(audience.viewer(w.spaceId, w.eventId, lead.id()).sees(leaders)).isFalse();
    assertThat(audience.viewer(w.spaceId, w.eventId, mate.id()).sees(leaders)).isTrue();
    assertThat(audience.participantIds(w.spaceId, w.eventId, leaders)).containsExactly(mate.id());
    // A withdrawn leader is not a recipient.
    w.withdraw(mate);
    assertThat(audience.participantIds(w.spaceId, w.eventId, leaders)).isEmpty();
    assertThat(audience.viewer(w.spaceId, w.eventId, mate.id()).sees(leaders)).isFalse();
  }

  @Test
  void audienceBodiesAreCheckedInOnePlace() {
    assertThat(Audience.parse(json.readTree("[{\"type\":\"LEADERS\"}]")).toJson(json))
        .isEqualTo("[{\"type\":\"LEADERS\"}]");
    assertThat(Audience.parse(json.readTree("[{\"type\":\"ALL\"}]")).includesParticipants())
        .isTrue();
    assertThat(Audience.parse(json.readTree("[{\"type\":\"STAFF\"}]")).includesParticipants())
        .isFalse();
    List<String> bad = new ArrayList<>();
    bad.add("null");
    bad.add("[]");
    bad.add("{\"type\":\"ALL\"}");
    bad.add("[{\"type\":\"ALL\"},{\"type\":\"STAFF\"}]");
    bad.add("[{\"type\":\"GROUP\"}]");
    bad.add("[{\"type\":\"ALL\",\"ids\":[]}]");
    bad.add("[{\"type\":1}]");
    bad.add("[\"ALL\"]");
    for (String value : bad) {
      assertThatThrownBy(() -> Audience.parse(json.readTree(value)))
          .as(value)
          .isInstanceOf(SceneException.class)
          .hasFieldOrPropertyWithValue("details", java.util.Map.of("field", "audience"));
    }
    assertThatThrownBy(() -> Audience.parse(null)).isInstanceOf(SceneException.class);
  }

  private JsonNode readOk(Person person, String body) throws Exception {
    return json.readTree(
        mvc.perform(ParticipantFeedFixture.write(post(READ), person.session()).content(body))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store"))
            .andReturn()
            .getResponse()
            .getContentAsString());
  }

  private List<MockHttpServletRequestBuilder> paths(Cookie session) {
    List<MockHttpServletRequestBuilder> out = new ArrayList<>();
    out.add(get(HOME));
    out.add(get(UPDATES));
    out.add(get(NOTIFICATIONS));
    out.add(ParticipantFeedFixture.write(post(READ), session).content("{\"upToSeq\":1}"));
    if (session != null) {
      out.get(0).cookie(session);
      out.get(1).cookie(session);
      out.get(2).cookie(session);
    }
    return out;
  }

  private void assertNoPrivateValues(
      String body, Person self, String otherName, String otherPhone) {
    String digits = self.phone().replaceAll("[^0-9]", "");
    assertThat(body).doesNotContain(self.phone(), digits);
    assertThat(body).doesNotContain(otherName, otherPhone, otherPhone.replaceAll("[^0-9]", ""));
    assertThat(body).doesNotContainIgnoringCase("phone").doesNotContainIgnoringCase("pin");
    assertThat(body).doesNotContainIgnoringCase("accessKey").doesNotContain(self.id().toString());
  }
}
