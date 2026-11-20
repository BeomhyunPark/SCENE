package app.scene.event.audience;

/**
 * Audience types accepted in January (DEC-080 §8). {@code ALL}: every active participant. {@code
 * LEADERS}: active participants marked leader in the latest group publication. {@code STAFF}: no
 * participant. Operators see every item whatever the audience.
 */
public enum AudienceType {
  ALL,
  LEADERS,
  STAFF
}
