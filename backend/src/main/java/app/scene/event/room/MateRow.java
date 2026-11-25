package app.scene.event.room;

import java.util.UUID;

/**
 * An active participant as roommates see them: name, 또래, and the GENDER label only while the chosen
 * option is shown. The id never leaves the server in a participant read.
 */
public record MateRow(UUID participantId, String name, String cohort, String genderLabel) {}
