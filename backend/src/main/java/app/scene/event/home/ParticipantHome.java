package app.scene.event.home;

import java.time.LocalDate;
import java.util.UUID;

/**
 * {@code GET /participant/home} (DEC-080 §3). Event header, the participant's own name and
 * application status, the form's current completion notice, the areas that are on, and the first
 * {@code updates} values. No phone, number, access key, or other participant.
 */
public record ParticipantHome(
    HomeEvent event,
    HomeParticipant participant,
    String completionNotice,
    ParticipantFeatures features,
    ParticipantUpdates updates) {

  public static final String SUBMITTED = "SUBMITTED";
  public static final String NONE = "NONE";

  public record HomeEvent(
      UUID eventId,
      String name,
      String status,
      LocalDate startDate,
      LocalDate endDate,
      String place,
      String timeZone) {}

  /** {@code applicationStatus} is {@code SUBMITTED} or {@code NONE}. */
  public record HomeParticipant(String name, String applicationStatus) {}
}
