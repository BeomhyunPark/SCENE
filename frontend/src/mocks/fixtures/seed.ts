export const localUsers = [
  {
    userId: "00000000-0000-4000-8000-000000000001",
    displayName: "Local owner",
  },
  {
    userId: "00000000-0000-4000-8000-000000000002",
    displayName: "Local manager",
  },
  {
    userId: "00000000-0000-4000-8000-000000000003",
    displayName: "Local staff",
  },
] as const;

export const localSpace = {
  spaceId: "00000000-0000-4000-8000-000000000010",
  name: "Local space",
} as const;

export const localEvent = {
  eventId: "00000000-0000-4000-8000-000000000020",
  spaceId: localSpace.spaceId,
  name: "Local event",
  lifecycleStatus: "DRAFT",
} as const;
