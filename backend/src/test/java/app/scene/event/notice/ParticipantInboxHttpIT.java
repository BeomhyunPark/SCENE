package app.scene.event.notice;

import static app.scene.event.notice.NoticeFixture.write;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.event.notice.NoticeFixture.Operator;
import app.scene.event.notice.NoticeFixture.Person;
import app.scene.event.notice.NoticeFixture.World;
import app.scene.support.PostgresTestcontainer;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The participant inbox (B5 #463, DEC-080 §7): what {@code GET /participant/notifications} shows to
 * a member, a leader and nobody else, and the {@code GROUP_PUBLISHED} rows a group publication
 * makes.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class ParticipantInboxHttpIT {

  private static final String INBOX = "/api/v1/participant/notifications";

  @Autowired WebApplicationContext context;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;

  NoticeFixture f;
  MockMvc mvc;

  @BeforeEach
  void setUp() {
    f = new NoticeFixture(context, jdbc, json);
    mvc = f.mvc;
  }

  @Test
  void leaderAndStaffNotificationsNeverReachAnOrdinaryParticipant() throws Exception {
    World w = f.world();
    Person leader = w.participant("김조장", "010-5200-0001");
    Person member = w.participant("이조원", "010-5200-0002");
    Person outsider = w.participant("박미배정", "010-5200-0003");
    Operator staff = w.operator("STAFF");
    w.publishGroup(leader, member);

    String all = id(w.create(w.owner, "전체 공지", "ALL", true, null));
    String leaders = id(w.create(w.owner, "조장 모임", "LEADERS", true, null));
    String staffOnly = id(w.create(w.owner, "운영진 집합", "STAFF", true, null));

    JsonNode memberInbox = f.read(INBOX, member.session());
    assertThat(kinds(memberInbox)).containsExactly("NOTICE_PUBLISHED", "GROUP_PUBLISHED");
    assertThat(targets(memberInbox)).contains(all).doesNotContain(leaders, staffOnly);
    assertThat(memberInbox.get("unreadCount").asInt()).isEqualTo(2);
    assertThat(memberInbox.toString()).doesNotContain("조장 모임", "운영진 집합", "김조장");

    JsonNode leaderInbox = f.read(INBOX, leader.session());
    assertThat(targets(leaderInbox)).contains(all, leaders).doesNotContain(staffOnly);
    assertThat(leaderInbox.toString()).doesNotContain("운영진 집합", "이조원");

    // Not in any group: no group row, only the notice for everyone.
    JsonNode outsiderInbox = f.read(INBOX, outsider.session());
    assertThat(kinds(outsiderInbox)).containsExactly("NOTICE_PUBLISHED");
    assertThat(targets(outsiderInbox)).containsExactly(all);

    // The staff notice reached the staff operator only.
    assertThat(w.operatorNotifications(staff.id(), "STAFF_NOTICE_PUBLISHED")).isEqualTo(1);
    for (Person person : List.of(leader, member, outsider)) {
      assertThat(w.notificationsFor(person.id(), "STAFF_NOTICE_PUBLISHED")).isZero();
    }
  }

  @Test
  void groupPublicationNotifiesOnlyPeopleWhoseGroupOrLeaderMarkChanged() throws Exception {
    World w = f.world();
    Person leader = w.participant("김조장", "010-5300-0001");
    Person member = w.participant("이조원", "010-5300-0002");
    Person stays = w.participant("최그대로", "010-5300-0003");
    w.publishGroup(leader, member, stays);
    String first = w.firstGroupId();
    String firstName = w.board().get("groups").get(0).get("name").asString();

    JsonNode leaderRow = only(f.read(INBOX, leader.session()));
    assertThat(leaderRow.get("kind").asString()).isEqualTo("GROUP_PUBLISHED");
    assertThat(leaderRow.get("target").get("type").asString()).isEqualTo("GROUP");
    assertThat(leaderRow.get("target").get("id").asString()).isEqualTo(first);
    assertThat(leaderRow.get("title").asString()).isEqualTo("내 조가 정해졌어요 · 조장");
    assertThat(leaderRow.get("body").asString()).isEqualTo(firstName);
    JsonNode memberRow = only(f.read(INBOX, member.session()));
    assertThat(memberRow.get("title").asString()).isEqualTo("내 조가 정해졌어요");
    assertThat(memberRow.toString()).doesNotContain("김조장", "최그대로");

    // Second publication: the member moves, the leader loses the mark, one is unassigned.
    String second = newGroup(w, "둘째 조");
    w.assign(member.id(), first, second);
    w.setLeader(first);
    Person removed = w.participant("정빠짐", "010-5300-0004");
    w.assign(removed.id(), null, first);
    w.publishGroups();
    w.assign(removed.id(), first, null);
    w.publishGroups();

    JsonNode moved = f.read(INBOX, member.session()).get("items").get(0);
    assertThat(moved.get("title").asString()).isEqualTo("내 조가 바뀌었어요");
    assertThat(moved.get("body").asString()).isEqualTo("둘째 조");
    assertThat(moved.get("target").get("id").asString()).isEqualTo(second);
    JsonNode cleared = f.read(INBOX, leader.session()).get("items").get(0);
    assertThat(cleared.get("title").asString()).isEqualTo("조장 표시가 바뀌었어요");
    JsonNode out = f.read(INBOX, removed.session()).get("items").get(0);
    assertThat(out.get("title").asString()).isEqualTo("조 배정이 바뀌었어요");
    assertThat(out.get("target").get("id").isNull()).isTrue();
    // Unchanged across both publications: still the one row from the first.
    assertThat(w.notificationsFor(stays.id(), "GROUP_PUBLISHED")).isEqualTo(1);

    // Reading one row lowers the count by one; the list shows it read.
    JsonNode inbox = f.read(INBOX, member.session());
    int unread = inbox.get("unreadCount").asInt();
    String rowId = inbox.get("items").get(0).get("notificationId").asString();
    JsonNode after =
        json.readTree(
            mvc.perform(
                    write(post(INBOX + "/read"), member.session())
                        .content("{\"notificationIds\":[\"" + rowId + "\"]}"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString());
    assertThat(after.get("unreadCount").asInt()).isEqualTo(unread - 1);
    assertThat(f.read(INBOX, member.session()).get("items").get(0).get("readAt").isNull())
        .isFalse();
  }

  private String newGroup(World w, String name) throws Exception {
    return json.readTree(
            mvc.perform(
                    write(post(w.path("/groups")), w.owner.session())
                        .content("{\"name\":\"" + name + "\"}"))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString())
        .get("group")
        .get("groupId")
        .asString();
  }

  private static String id(JsonNode written) {
    return written.get("notice").get("noticeId").asString();
  }

  private static JsonNode only(JsonNode page) {
    assertThat(page.get("items")).hasSize(1);
    return page.get("items").get(0);
  }

  private static List<String> kinds(JsonNode page) {
    List<String> out = new ArrayList<>();
    for (JsonNode item : page.get("items")) {
      out.add(item.get("kind").asString());
    }
    return out;
  }

  private static List<String> targets(JsonNode page) {
    List<String> out = new ArrayList<>();
    for (JsonNode item : page.get("items")) {
      JsonNode id = item.get("target").get("id");
      out.add(id == null || id.isNull() ? null : id.asString());
    }
    return out;
  }
}
