package app.scene.event.application;

import java.util.UUID;

/**
 * First response for a public submit. {@code accessKey} is the raw key and is not stored. Later
 * reads do not return it.
 */
public record SubmittedApplication(UUID applicationId, UUID participantId, String accessKey) {}
