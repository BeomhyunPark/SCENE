package app.scene.space.invitation;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.UUID;

/**
 * One active member. {@code email} is present only when the viewer is an active space {@code OWNER}
 * or {@code ADMIN} and the member has a verified Google address (DEC-076).
 */
public record SpaceMemberItem(
    UUID userId,
    String displayName,
    String role,
    @JsonInclude(JsonInclude.Include.NON_NULL) String email) {}
