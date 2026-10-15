package app.scene.event;

/**
 * Stored event kind. DEC-003: the server keeps the code and does not branch permissions,
 * validation, or transitions on it.
 */
public enum EventType {
  RETREAT,
  VISION_TRIP,
  OUTREACH,
  SHORT_TERM_MISSION,
  BIBLE_SCHOOL,
  CAMP,
  WORKSHOP,
  OTHER
}
