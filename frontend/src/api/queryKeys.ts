export const queryKeys = {
  me: ["operator", "me"] as const,
  spaces: ["operator", "spaces"] as const,
  events: (spaceId: string, page: number) => ["spaces", spaceId, "events", page] as const,
  event: (eventId: string) => ["events", eventId] as const,
};
