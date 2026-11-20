package app.scene.event.application;

import java.util.UUID;

/**
 * Response of a public submit (DEC-078). {@code revised} is true when the phone already had an
 * application and the number matched, so the submit became an edit. The session token travels in
 * the cookie only. {@code completionNotice} is the form's plain-text notice at submit time, or null
 * (#406). {@code restored} is true when the phone's application had been withdrawn and the matching
 * number brought it back (DEC-084 §5); {@code revised} is then true as well.
 */
public record SubmittedApplication(
    UUID applicationId,
    UUID participantId,
    int revision,
    boolean revised,
    String completionNotice,
    boolean restored) {}
