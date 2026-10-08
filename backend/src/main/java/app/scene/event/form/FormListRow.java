package app.scene.event.form;

import java.util.UUID;

/** One form on the event list. Fields and answers stay off this row. */
public record FormListRow(UUID formId, boolean acceptingApplications) {}
