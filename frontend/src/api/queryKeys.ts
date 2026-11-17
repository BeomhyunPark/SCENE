export const queryKeys = {
  me: ["operator", "me"] as const,
  spaces: ["operator", "spaces"] as const,
  events: (spaceId: string, page: number) => ["spaces", spaceId, "events", page] as const,
  eventNames: (spaceId: string) => ["spaces", spaceId, "event-names"] as const,
  leavePreview: (spaceId: string) => ["spaces", spaceId, "leave-preview"] as const,
  event: (eventId: string) => ["events", eventId] as const,
  retrospective: (eventId: string) => ["events", eventId, "retrospective"] as const,
  tasks: (eventId: string, page: number) => ["events", eventId, "tasks", page] as const,
  task: (eventId: string, taskId: string) => ["events", eventId, "tasks", taskId] as const,
  operators: (eventId: string) => ["events", eventId, "operators"] as const,
  invitations: (eventId: string) => ["events", eventId, "invitations"] as const,
  permissions: (eventId: string, userId: string) =>
    ["events", eventId, "operators", userId, "permissions"] as const,
  checkInSummary: (eventId: string) => ["events", eventId, "check-ins", "summary"] as const,
  checkIns: (eventId: string) => ["events", eventId, "check-ins"] as const,
  checkInRoster: (eventId: string, query: { q: string; checkedIn: boolean | null }) =>
    ["events", eventId, "check-ins", "roster", query] as const,
  forms: (eventId: string, page: number) => ["events", eventId, "forms", page] as const,
  form: (eventId: string, formId: string) => ["events", eventId, "forms", formId] as const,
  applications: (eventId: string, page: number) => ["events", eventId, "applications", page] as const,
  application: (eventId: string, applicationId: string) =>
    ["events", eventId, "applications", "detail", applicationId] as const,
  publicForm: (eventId: string, formId: string) => ["public", "forms", eventId, formId] as const,
  participantMe: (eventId: string) => ["participant", "me", eventId] as const,
  participantCheckIn: (eventId: string) => ["participant", "check-in", eventId] as const,
};
