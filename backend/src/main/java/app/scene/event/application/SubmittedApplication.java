package app.scene.event.application;

import java.util.UUID;

/**
 * First response for a public submit. {@code accessKey} is the raw key and is not stored. Later
 * reads do not return it. {@code completionNotice} is the form's plain-text notice at submit time,
 * or null (#406).
 */
public record SubmittedApplication(
    UUID applicationId, UUID participantId, String accessKey, String completionNotice) {}
