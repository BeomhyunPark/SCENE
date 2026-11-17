package app.scene.event.group;

import java.util.List;

/**
 * {@code GET …/group-board}: the working copy with every active participant. {@code slots} is null
 * when the form has no setup or the setup has no meal or worship slot.
 */
public record GroupBoard(
    String eventStatus,
    long boardVersion,
    List<Group> groups,
    List<BoardParticipant> participants,
    List<WithdrawnParticipant> withdrawn,
    PublicationSummary publication,
    List<BoardSlot> slots) {}
