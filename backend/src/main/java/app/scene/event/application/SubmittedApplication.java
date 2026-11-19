package app.scene.event.application;

import java.util.UUID;

/**
 * Response of a public submit (DEC-078). {@code revised} is true when the phone already had an
 * application and the number matched, so the submit became an edit. The session token travels in
 * the cookie only.
 */
public record SubmittedApplication(
    UUID applicationId, UUID participantId, int revision, boolean revised) {}
