package app.scene.space.invitation;

import java.util.UUID;

/**
 * Accept body. {@code outcome} is {@code ACCEPTED}, {@code ALREADY_ACCEPTED} or {@code
 * ALREADY_MEMBER}. {@code spaceId} lets the screen open the space it just joined.
 */
public record SpaceInvitationAcceptance(String outcome, UUID spaceId) {}
