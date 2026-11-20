package app.scene.event.schedule;

import app.scene.event.form.FormPreset;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

/** Day list and {@code +09:00} times of schedule items (DEC-081 §3, schedule-contract §2). */
public final class ScheduleViews {

  /** A longer period gives no day list; event dates are validated where they are written. */
  static final int DAYS_MAX = 366;

  private static final DateTimeFormatter OFFSET =
      DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX");

  private ScheduleViews() {}

  /** {@code days[]} item. */
  public record Day(int day, String date, String dayLabel) {}

  /** Event days from the start date to the end date (the start date alone without an end). */
  static int dayCount(LocalDate start, LocalDate end) {
    if (start == null) {
      return 0;
    }
    if (end == null) {
      return 1;
    }
    long count = ChronoUnit.DAYS.between(start, end) + 1;
    return count < 1 || count > DAYS_MAX ? 0 : (int) count;
  }

  static List<Day> days(LocalDate start, LocalDate end) {
    List<Day> out = new ArrayList<>();
    int count = dayCount(start, end);
    for (int day = 1; day <= count; day++) {
      LocalDate date = start.plusDays(day - 1L);
      out.add(new Day(day, date.toString(), FormPreset.dayLabel(date)));
    }
    return out;
  }

  /** Date of {@code day}, or null without a start date. */
  static String date(LocalDate start, int day) {
    return start == null ? null : start.plusDays(day - 1L).toString();
  }

  static boolean endsNextDay(String startTime, String endTime) {
    return endTime != null && endTime.compareTo(startTime) < 0;
  }

  static String startsAt(LocalDate start, int day, String startTime, ZoneId zone) {
    if (start == null) {
      return null;
    }
    return at(start.plusDays(day - 1L), startTime, zone);
  }

  static String endsAt(LocalDate start, int day, String startTime, String endTime, ZoneId zone) {
    if (start == null || endTime == null) {
      return null;
    }
    LocalDate date = start.plusDays(day - 1L);
    return at(endsNextDay(startTime, endTime) ? date.plusDays(1) : date, endTime, zone);
  }

  private static String at(LocalDate date, String time, ZoneId zone) {
    return LocalDateTime.of(date, LocalTime.parse(time)).atZone(zone).format(OFFSET);
  }
}
