export const queryKeys = {
  me: ["operator", "me"] as const,
  spaces: ["operator", "spaces"] as const,
  events: (spaceId: string, page: number) => ["spaces", spaceId, "events", page] as const,
  /** Events I operate in any organization (#387). Under "operator" so a login clear resets it. */
  operatedEvents: (page: number) => ["operator", "operated-events", page] as const,
  allOperatedEvents: ["operator", "operated-events"] as const,
  eventNames: (spaceId: string) => ["spaces", spaceId, "event-names"] as const,
  leavePreview: (spaceId: string) => ["spaces", spaceId, "leave-preview"] as const,
  spaceMembers: (spaceId: string) => ["spaces", spaceId, "members"] as const,
  spaceInvitations: (spaceId: string) => ["spaces", spaceId, "invitations"] as const,
  event: (eventId: string) => ["events", eventId] as const,
  retrospective: (eventId: string) => ["events", eventId, "retrospective"] as const,
  /** Every task list and detail of an event, e.g. after an operator removal clears assignees. */
  allTasks: (eventId: string) => ["events", eventId, "tasks"] as const,
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
  /** Every roster page at once for the 조별 view (#288); under checkIns so a check-in reloads it. */
  checkInRosterAll: (eventId: string) => ["events", eventId, "check-ins", "roster-all"] as const,
  publishedGroups: (eventId: string) => ["events", eventId, "groups", "published"] as const,
  groupBoard: (eventId: string) => ["events", eventId, "group-board"] as const,
  forms: (eventId: string, page: number) => ["events", eventId, "forms", page] as const,
  form: (eventId: string, formId: string) => ["events", eventId, "forms", formId] as const,
  applications: (eventId: string, page: number) => ["events", eventId, "applications", page] as const,
  applicationSummary: (eventId: string) => ["events", eventId, "applications", "summary"] as const,
  applicationTable: (eventId: string) => ["events", eventId, "applications", "table"] as const,
  application: (eventId: string, applicationId: string) =>
    ["events", eventId, "applications", "detail", applicationId] as const,
  /** Every notice list and detail of an event: one invalidation after any notice write (D3). */
  notices: (eventId: string) => ["events", eventId, "notices"] as const,
  noticeList: (eventId: string, filter: string) => ["events", eventId, "notices", "list", filter] as const,
  notice: (eventId: string, noticeId: string) => ["events", eventId, "notices", "detail", noticeId] as const,
  /** The 운영진 공지 card on the operator event home (STAFF audience, published, 3). */
  staffNotices: (eventId: string) => ["events", eventId, "notices", "staff"] as const,
  /** Operator refresh check of one event (#436); the badge reads it. */
  operatorUpdates: (eventId: string) => ["events", eventId, "operator-updates"] as const,
  /** Every page of the operator's notification list of one event (#436). */
  operatorNotifications: (eventId: string) => ["events", eventId, "operator-notifications"] as const,
  applicationRevisions: (eventId: string, applicationId: string) =>
    ["events", eventId, "applications", "revisions", applicationId] as const,
  publicForm: (eventId: string, formId: string) => ["public", "forms", eventId, formId] as const,
  participantMe: (eventId: string) => ["participant", "me", eventId] as const,
  participantCheckIn: (eventId: string) => ["participant", "check-in", eventId] as const,
  participantGroup: (eventId: string) => ["participant", "group", eventId] as const,
  /**
   * Participant home cards (DEC-080). A card reading more than one request keeps this key as the
   * prefix, e.g. `[...queryKeys.participantNotices(eventId), "detail", noticeId]`, so the one
   * invalidation from `participant/updateTargets.ts` reloads all of them.
   */
  participantHome: (eventId: string) => ["participant", "home", eventId] as const,
  participantSchedule: (eventId: string) => ["participant", "schedule", eventId] as const,
  participantNotices: (eventId: string) => ["participant", "notices", eventId] as const,
  participantRooms: (eventId: string) => ["participant", "rooms", eventId] as const,
  participantApplication: (eventId: string) => ["participant", "application", eventId] as const,
  participantNotifications: (eventId: string) => ["participant", "notifications", eventId] as const,
  /** Every participant read of the event, removed on logout. */
  participantAll: ["participant"] as const,
};
