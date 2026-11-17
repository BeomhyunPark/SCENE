package app.scene.event.group;

import java.util.List;

/** {@code GET …/group-board}: the working copy with every active participant. */
public record GroupBoard(
    String eventStatus,
    long boardVersion,
    List<Group> groups,
    List<BoardParticipant> participants,
    List<WithdrawnParticipant> withdrawn,
    PublicationSummary publication) {}
