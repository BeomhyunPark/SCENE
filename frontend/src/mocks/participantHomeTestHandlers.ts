import { http, HttpResponse } from "msw";
import type { ParticipantFeatures } from "../api/participantHome";

/** Test seams (#425): static participant home answers for screen tests. Not used by the mock app. */

export const ALL_FEATURES: ParticipantFeatures = { schedule: true, notices: true, groups: true, rooms: true };

export const UPDATES = {
  home: 1,
  schedule: 0,
  notices: 0,
  group: 0,
  rooms: 0,
  mealOrder: 0,
  checkIn: 0,
  application: 1,
  notifications: { latestSeq: 0, unreadCount: 0 },
  pollAfterSeconds: 30,
  serverTime: "2027-01-22T05:30:12Z",
};

export function homeBody(overrides: { features?: Partial<ParticipantFeatures>; event?: Record<string, unknown>; [key: string]: unknown } = {}) {
  const { features, event, ...rest } = overrides;
  return {
    event: {
      eventId: "event-1",
      name: "2027 청년부 겨울수련회",
      status: "ACTIVE",
      startDate: "2027-01-22",
      endDate: "2027-01-24",
      place: "양평 수양관",
      timeZone: "Asia/Seoul",
      ...event,
    },
    participant: { name: "김", applicationStatus: "SUBMITTED" },
    completionNotice: null,
    features: { ...ALL_FEATURES, mealOrder: true, ...features },
    updates: UPDATES,
    ...rest,
  };
}

export const SCHEDULE_NOT_PUBLISHED = {
  status: "NOT_PUBLISHED",
  publishedAt: null,
  timeZone: "Asia/Seoul",
  serverTime: "2027-01-22T05:30:12Z",
  days: [],
  items: [],
  removedItems: [],
};

/** Static `home` and `updates` for screen tests that answer `/participant/me` themselves. */
export function participantHomeHandlers(overrides: Parameters<typeof homeBody>[0] = {}) {
  return [
    http.get("/api/v1/participant/home", () => HttpResponse.json(homeBody(overrides))),
    http.get("/api/v1/participant/updates", () => HttpResponse.json(UPDATES)),
    // The 지금·다음 card reads the schedule on every home screen.
    http.get("/api/v1/participant/schedule", () => HttpResponse.json(SCHEDULE_NOT_PUBLISHED)),
    EMPTY_NOTICES,
  ];
}

/** No notices: the 최신 공지 card and 공지 tab read this (D4). */
export const EMPTY_NOTICES = http.get("/api/v1/participant/notices", () => HttpResponse.json({ items: [], nextBefore: null }));

/** Quiet answers for every card, for tests about something else (sign-in, apply). */
export function participantCardHandlers() {
  return [
    ...participantHomeHandlers(),
    http.get("/api/v1/participant/check-in", () =>
      HttpResponse.json({ status: "NOT_STARTED", code: null, checkedIn: false, checkedInAt: null }),
    ),
    http.get("/api/v1/participant/group", () =>
      HttpResponse.json({ status: "NOT_PUBLISHED", publishedAt: null, group: null, leader: false, members: null }),
    ),
    http.get("/api/v1/participant/application", () =>
      HttpResponse.json({ applicationId: "app-1", formId: "form-1", revision: 1, submittedAt: "2026-12-16T00:00:00Z", acceptingEdits: false, fields: [], answers: [] }),
    ),
  ];
}
