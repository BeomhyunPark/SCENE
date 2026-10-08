package app.scene.event.form;

import java.util.UUID;

/** One item on the event form list. */
public record FormListItem(UUID formId, boolean acceptingApplications) {}
