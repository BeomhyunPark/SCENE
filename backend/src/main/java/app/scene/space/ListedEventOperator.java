package app.scene.space;

import java.util.UUID;

/**
 * One operator on an event list or detail. Name and role only. Contact, tokens, sessions, and
 * permission rows are not part of this shape.
 */
public record ListedEventOperator(UUID userId, String displayName, String role) {}
