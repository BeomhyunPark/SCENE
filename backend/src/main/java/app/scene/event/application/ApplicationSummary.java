package app.scene.event.application;

import java.util.List;
import java.util.UUID;

/**
 * Counts of the event's {@code SUBMITTED} applications for the operator summary screen (#251,
 * DEC-073). A section is {@code null} when the form does not ask its question, or the question is
 * turned off. No phone and no access key are here.
 */
public record ApplicationSummary(
    String eventStatus,
    UUID formId,
    boolean fromSetup,
    long total,
    Attendance attendance,
    Choice gender,
    Cohorts cohorts,
    Meals meals,
    Lodging lodging,
    Transport transport,
    Shuttle shuttle,
    Carpool carpool,
    Mobility mobility) {

  /** {@code asked} is false when there is no visible attendance question: everyone is FULL. */
  public record Attendance(boolean asked, long full, long partial, long worshipOnly) {}

  /** One option of a choice question, in the question's option order. */
  public record OptionCount(String optionId, String label, boolean hidden, long count) {}

  /** {@code noAnswer} counts applications in scope with no counted option. */
  public record Choice(List<OptionCount> options, long noAnswer) {}

  public record CohortCount(String cohort, long count) {}

  public record Cohorts(List<CohortCount> items, long noAnswer) {}

  /** {@code meal} is BREAKFAST, LUNCH, DINNER or WORSHIP. */
  public record Slot(String optionId, String meal, String label, long count) {}

  public record MealDay(int day, String date, String label, List<Slot> slots) {}

  /** {@code unanswered}: partial and worship-only applicants with no meal answer. */
  public record Meals(List<MealDay> days, long unanswered) {}

  /** {@code date} is the evening of the night. */
  public record Night(String optionId, int night, String date, String label, long count) {}

  /** {@code unanswered}: partial applicants when the lodging question is not visible. */
  public record Lodging(List<Night> nights, long unanswered) {}

  /** {@code out} counts a driver there ({@code opt_car}) as a driver back. */
  public record Transport(Choice in, Choice out) {}

  /** Each side is null when its round question is not visible. */
  public record Shuttle(Choice in, Choice out) {}

  public record Offer(
      UUID applicationId, String name, String cohort, Long seats, String area, String note) {}

  public record Carpool(long offerCount, long seatTotal, List<Offer> offers) {}

  public record Request(UUID applicationId, String name, String cohort, String area) {}

  /** Each side is null when its question is not visible. */
  public record Mobility(List<Request> in, List<Request> out) {}
}
