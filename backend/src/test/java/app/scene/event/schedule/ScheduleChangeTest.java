package app.scene.event.schedule;

import static org.assertj.core.api.Assertions.assertThat;

import app.scene.event.audience.Audience;
import app.scene.event.audience.AudienceType;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Change marks across publications (DEC-081 §6) and the notification body. */
class ScheduleChangeTest {

  private static final Instant AT = Instant.parse("2027-01-22T12:00:00Z");

  private static ItemContent item(String start, String place, String title) {
    return new ItemContent(
        2, start, null, title, place, null, "PROGRAM", Audience.of(AudienceType.ALL), null, 0);
  }

  @Test
  void newItemIsAddedAndStaysAddedWhileNew() {
    ScheduleSnapshot.Change added =
        ScheduleService.change(item("09:00", null, "a"), null, null, AT);
    assertThat(added.kind()).isEqualTo("ADDED");
    assertThat(added.previous()).isNull();
    ScheduleSnapshot.Change edited =
        ScheduleService.change(
            item("09:30", null, "a"), item("09:00", null, "a"), added, AT.plusSeconds(60));
    assertThat(edited.kind()).isEqualTo("ADDED");
  }

  @Test
  void unchangedItemCarriesItsMarkFor24Hours() {
    ScheduleSnapshot.Change mark =
        new ScheduleSnapshot.Change("CHANGED", AT, List.of("place"), Map.of("place", "x"));
    ItemContent same = item("09:00", "y", "a");
    assertThat(ScheduleService.change(same, same, mark, AT.plus(23, ChronoUnit.HOURS)))
        .isSameAs(mark);
    assertThat(ScheduleService.change(same, same, mark, AT.plus(25, ChronoUnit.HOURS))).isNull();
  }

  @Test
  void laterChangeMergesAndAnOldMarkStartsOver() {
    ScheduleSnapshot.Change first =
        ScheduleService.change(item("09:30", "b", "a"), item("09:00", "b", "a"), null, AT);
    assertThat(first.fields()).containsExactly("startTime");
    ScheduleSnapshot.Change merged =
        ScheduleService.change(
            item("09:30", "c", "t"), item("09:30", "b", "a"), first, AT.plusSeconds(600));
    assertThat(merged.fields()).containsExactly("startTime", "title", "place");
    assertThat(merged.previous()).containsEntry("startTime", "09:00").containsEntry("place", "b");
    assertThat(merged.previous()).doesNotContainKey("title");
    ScheduleSnapshot.Change fresh =
        ScheduleService.change(
            item("10:00", "b", "a"), item("09:30", "b", "a"), first, AT.plus(2, ChronoUnit.DAYS));
    assertThat(fresh.previous()).containsEntry("startTime", "09:30");
    // Back to the value before the first change: no mark.
    assertThat(
            ScheduleService.change(
                item("09:00", "b", "a"), item("09:30", "b", "a"), first, AT.plusSeconds(60)))
        .isNull();
  }

  @Test
  void bodyListsThreeTitles() {
    assertThat(ScheduleService.titles(List.of("a"))).isEqualTo("a");
    assertThat(ScheduleService.titles(List.of("a", "b", "c", "d", "e"))).isEqualTo("a, b, c 외 2건");
  }
}
