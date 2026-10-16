export const queryKeys = {
  me: ["operator", "me"] as const,
  spaces: ["operator", "spaces"] as const,
  events: (spaceId: string, page: number) => ["spaces", spaceId, "events", page] as const,
  event: (eventId: string) => ["events", eventId] as const,
  tasks: (eventId: string, page: number) => ["events", eventId, "tasks", page] as const,
  task: (eventId: string, taskId: string) => ["events", eventId, "tasks", taskId] as const,
  operators: (eventId: string) => ["events", eventId, "operators"] as const,
  permissions: (eventId: string, userId: string) =>
    ["events", eventId, "operators", userId, "permissions"] as const,
  forms: (eventId: string, page: number) => ["events", eventId, "forms", page] as const,
  form: (eventId: string, formId: string) => ["events", eventId, "forms", formId] as const,
};
