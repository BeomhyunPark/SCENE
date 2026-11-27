// Shared setup for the week-4 real-click scripts (D5 #515, F4 #516, I6 #348, I5 #517). Runs against a
// local backend (`local` profile, PostgreSQL 17 from backend/compose.yaml) and Vite with VITE_API_MOCK=0.
// Everything goes through the real HTTP API: event, form, five applicants, two groups (published, with a
// leader), two rooms (published). Returns the ids and logged-in contexts.
const { chromium } = require("playwright");

const APP = "http://localhost:5173";
const OWNER = "00000000-0000-4000-8000-000000000001";
const PIN = "730914";
const H = { "X-XSRF-TOKEN": "dev-csrf" };
const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: "ko-KR", timezoneId: "Asia/Seoul" };
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ko-KR", timezoneId: "Asia/Seoul" };

async function setup(name, { browser: given } = {}) {
  const browser = given ?? (await chromium.launch());
  const context = async (options, extra = {}) => {
    const ctx = await browser.newContext({ ...options, ...extra });
    await ctx.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
    return ctx;
  };
  const api = async (ctx, method, path, data) => {
    const res = await ctx.request.fetch(`${APP}${path}`, { method, headers: H, data });
    const text = await res.text();
    if (res.status() >= 300) throw new Error(`${method} ${path} ${res.status()} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  };
  const operator = async (options, extra) => {
    const ctx = await context(options, extra);
    await api(ctx, "POST", "/api/v1/operator/auth/login", { userId: OWNER });
    return ctx;
  };
  const op = await operator(desktop);
  const spaces = await api(op, "GET", "/api/v1/operator/spaces");
  const spaceId = (spaces.items ?? spaces)[0].spaceId;
  const today = new Date(Date.now() + 9 * 3600e3);
  const day = (offset) => new Date(today.getTime() + offset * 86400e3).toISOString().slice(0, 10);
  const { eventId } = await api(op, "POST", `/api/v1/operator/spaces/${spaceId}/events`, {
    name, eventType: "RETREAT", startDate: day(0), endDate: day(2), place: "양평 수양관",
  });
  const ev = `/api/v1/operator/events/${eventId}`;
  const { formId } = await api(op, "POST", `${ev}/forms`, {});
  const lifecycle = await api(op, "GET", `${ev}/lifecycle`);
  await api(op, "POST", `${ev}/activate`, { expectedLifecycleVersion: lifecycle.lifecycleVersion ?? 0 });
  await api(op, "PATCH", `${ev}/forms/${formId}`, { acceptingApplications: true });
  const form = await api(op, "GET", `${ev}/forms/${formId}`);
  const field = (key) => form.fields.find((f) => (f.presetKey ?? f.systemKey) === key);
  const people = [];
  for (const [i, person] of ["김조장", "박조원", "이조원", "최다른", "정다른"].entries()) {
    const ctx = await context(phone);
    const answers = [
      { fieldId: field("NAME").fieldId, text: person },
      { fieldId: field("PHONE").fieldId, text: `010-4848-00${String(i + 1).padStart(2, "0")}` },
    ];
    if (field("COHORT")) answers.push({ fieldId: field("COHORT").fieldId, text: `9${i + 1}` });
    if (field("CONSENT")) answers.push({ fieldId: field("CONSENT").fieldId, value: { value: true } });
    const body = await api(ctx, "POST", `/api/v1/public/events/${eventId}/forms/${formId}/applications`, { pin: PIN, answers });
    people.push({ ctx, name: person, ...body });
  }
  const [lead, mate1, mate2, other1, other2] = people;
  const g1 = (await api(op, "POST", `${ev}/groups`, { name: "1조" })).group.groupId;
  const g2 = (await api(op, "POST", `${ev}/groups`, { name: "2조" })).group.groupId;
  const toGroup = (list, groupId) => list.map((p) => ({ participantId: p.participantId, fromGroupId: null, toGroupId: groupId }));
  await api(op, "POST", `${ev}/group-assignments`, { changes: [...toGroup([lead, mate1, mate2], g1), ...toGroup([other1, other2], g2)] });
  await api(op, "PUT", `${ev}/groups/${g1}/leaders`, { participantIds: [lead.participantId], expectedVersion: 0 });
  const groupBoard = await api(op, "GET", `${ev}/group-board`);
  await api(op, "POST", `${ev}/groups/publish`, { expectedBoardVersion: groupBoard.boardVersion, confirmUnassigned: true });
  const r1 = (await api(op, "POST", `${ev}/rooms`, { name: "301호", locationNote: "본관 3층 계단 옆", capacity: 6 })).room.roomId;
  const r2 = (await api(op, "POST", `${ev}/rooms`, { name: "302호", locationNote: "본관 3층 끝", capacity: 4 })).room.roomId;
  const toRoom = (list, roomId) => list.map((p) => ({ participantId: p.participantId, fromRoomId: null, toRoomId: roomId }));
  await api(op, "POST", `${ev}/room-assignments`, { changes: [...toRoom([lead, mate1], r1), ...toRoom([mate2, other1, other2], r2)] });
  const roomBoard = await api(op, "GET", `${ev}/room-board`);
  await api(op, "POST", `${ev}/rooms/publish`, { expectedBoardVersion: roomBoard.boardVersion, confirmUnassigned: true });
  return { browser, context, api, operator, op, eventId, ev, formId, people, lead, mate1, mate2, other1, other2, desktop, phone, APP };
}

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

module.exports = { setup, overflow, APP };
