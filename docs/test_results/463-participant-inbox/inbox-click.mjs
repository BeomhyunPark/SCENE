// Real click check for B5 (#463) against a local backend (local profile) and Vite with VITE_API_MOCK=0.
// Setup (event, form, people) and every publication (notice, schedule, groups, rooms) go through the
// operator HTTP API; the participant phone (390px) keeps 알림함 open and waits for its own `updates`
// poll, then taps the new row and checks where it lands and that the bell count drops.
// Usage: node inbox-click.mjs <outDir>
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const [outDir] = process.argv.slice(2);
const APP = "http://localhost:5173";
const OWNER = "00000000-0000-4000-8000-000000000001";
const PIN = "730914";
const log = [];
const note = (line) => { log.push(line); console.log(line); };

const browser = await chromium.launch();
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ko-KR", timezoneId: "Asia/Seoul" };
async function context() {
  const ctx = await browser.newContext(phone);
  await ctx.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
  return ctx;
}
const H = { "X-XSRF-TOKEN": "dev-csrf" };
async function api(ctx, method, path, data) {
  const res = await ctx.request.fetch(`${APP}${path}`, { method, headers: H, data });
  const text = await res.text();
  if (res.status() >= 300) throw new Error(`${method} ${path} ${res.status()} ${text}`);
  return text ? JSON.parse(text) : null;
}
const shot = (page, name) => page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });

// ---- operator: event, form, people ----
const op = await context();
await api(op, "POST", "/api/v1/operator/auth/login", { userId: OWNER });
const spaces = await api(op, "GET", "/api/v1/operator/spaces");
const spaceId = (spaces.items ?? spaces)[0].spaceId;
const E = (suffix) => `/api/v1/operator/events/${eventId}${suffix}`;
const { eventId } = await api(op, "POST", `/api/v1/operator/spaces/${spaceId}/events`, { name: "알림함 확인 수련회", eventType: "RETREAT", startDate: "2027-01-22", endDate: "2027-01-24", place: "양평 수양관" });
const { formId } = await api(op, "POST", E("/forms"), {});
const lifecycle = await api(op, "GET", E("/lifecycle"));
await api(op, "POST", E("/activate"), { expectedLifecycleVersion: lifecycle.lifecycleVersion ?? 0 });
await api(op, "PATCH", E(`/forms/${formId}`), { acceptingApplications: true });
const form = await api(op, "GET", E(`/forms/${formId}`));
const fields = Object.fromEntries(form.fields.map((f) => [f.presetKey ?? f.systemKey ?? f.fieldId, f]));

async function apply(name, n) {
  const ctx = await context();
  const answers = [
    { fieldId: fields.NAME.fieldId, text: name },
    { fieldId: fields.PHONE.fieldId, text: `010-4630-000${n}` },
  ];
  if (fields.COHORT) answers.push({ fieldId: fields.COHORT.fieldId, text: `9${n}` });
  const body = await api(ctx, "POST", `/api/v1/public/events/${eventId}/forms/${formId}/applications`, { pin: PIN, answers });
  return { ctx, name, ...body };
}
const garam = await apply("김가람", 1);
const narae = await apply("박나래", 2);

// ---- garam's phone: home with the bell, then 알림함 stays open ----
const page = await garam.ctx.newPage();
let inboxReads = 0;
page.on("request", (request) => {
  if (new URL(request.url()).pathname === "/api/v1/participant/notifications") inboxReads += 1;
});
await page.goto(`${APP}/participate/${eventId}`);
const bell = page.getByRole("link", { name: /^알림함/ });
await bell.waitFor();
const tabs = await page.getByRole("navigation", { name: "참가자 메뉴" }).getByRole("link").allInnerTexts();
note(`홈: 종 "${await bell.getAttribute("aria-label")}", 하단 탭 ${tabs.length}개 (${tabs.join("·")})`);
await shot(page, "01-home-bell");
await bell.click();
await page.getByText(/아직 받은 알림이 없어요/).waitFor();
await shot(page, "02-inbox-empty");
note("알림함: \"아직 받은 알림이 없어요…\"");

const currentTab = async () =>
  (await page.locator('.participant-tabs a[aria-current="page"]').innerText().catch(() => "")).trim();

/** Publish, wait on the open inbox for the row, tap it, check the landing screen and the bell. */
async function round(label, publish, rowName, landing, shotName) {
  const before = (await bell.getAttribute("aria-label")) ?? "";
  const readsBefore = inboxReads;
  const started = Date.now();
  await publish();
  const row = page.getByRole("button", { name: rowName });
  await row.waitFor({ timeout: 35_000 });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  await page.waitForFunction(() => document.querySelector(".participant-bell__badge") !== null, null, { timeout: 5_000 });
  const badge = await bell.getAttribute("aria-label");
  note(`${label}: 공개 뒤 ${seconds}초에 알림함에 한 줄 "${(await row.innerText()).replace(/\n+/g, " / ")}" · 종 "${before}" → "${badge}" · 목록 다시 읽기 ${inboxReads - readsBefore}번`);
  await shot(page, `${shotName}-a-row`);
  await row.click();
  await landing();
  await page.waitForFunction(() => document.querySelector(".participant-bell__badge") === null, null, { timeout: 5_000 });
  note(`  → 눌러서 ${page.url().replace(`${APP}/participate/${eventId}`, "") || "/"} (현재 탭 "${await currentTab()}") · 종 "${await bell.getAttribute("aria-label")}"`);
  await shot(page, `${shotName}-b-landing`);
  await bell.click();
  await page.getByRole("heading", { name: "알림", level: 1 }).waitFor();
}

// 1. notice for everyone
await round(
  "공지 발행",
  () => api(op, "POST", E("/notices"), { title: "첫날 집합 장소 안내", body: "본관 로비에서 모여요.", audience: [{ type: "ALL" }], publish: true }),
  /첫날 집합 장소 안내/,
  () => page.getByRole("heading", { name: "첫날 집합 장소 안내", level: 1 }).waitFor(),
  "03-notice",
);

// 2. schedule: one item saved and published at once
await round(
  "일정 공개",
  () => api(op, "POST", E("/schedule/items"), { day: 1, startTime: "19:00", title: "저녁 집회", place: "대강당", category: "WORSHIP", audience: [{ type: "ALL" }], publish: true }),
  /일정표가 올라왔어요/,
  () => page.getByRole("heading", { name: "일정", level: 1 }).waitFor(),
  "04-schedule",
);

// 3. groups: garam and narae in 1조, narae leads
const groupId = (await api(op, "POST", E("/groups"), { name: "1조" })).group.groupId;
await api(op, "POST", E("/group-assignments"), {
  changes: [garam, narae].map((p) => ({ participantId: p.participantId, fromGroupId: null, toGroupId: groupId })),
});
const groupBoard = await api(op, "GET", E("/group-board"));
const version = groupBoard.groups.find((g) => g.groupId === groupId).version;
await api(op, "PUT", E(`/groups/${groupId}/leaders`), { expectedVersion: version, participantIds: [narae.participantId] });
await round(
  "조 공개",
  async () => {
    const board = await api(op, "GET", E("/group-board"));
    await api(op, "POST", E("/groups/publish"), { expectedBoardVersion: board.boardVersion, confirmUnassigned: true });
  },
  /내 조가 정해졌어요/,
  async () => { await page.waitForURL(/\/group$/); },
  "05-group",
);

// 4. rooms: garam in 301호
const r301 = (await api(op, "POST", E("/rooms"), { name: "301호", locationNote: "본관 3층 계단 옆", capacity: 6 })).room.roomId;
await api(op, "POST", E("/room-assignments"), {
  changes: [garam, narae].map((p) => ({ participantId: p.participantId, fromRoomId: null, toRoomId: r301 })),
});
await round(
  "숙소 공개",
  async () => {
    const board = await api(op, "GET", E("/room-board"));
    await api(op, "POST", E("/rooms/publish"), { expectedBoardVersion: board.boardVersion, confirmUnassigned: true, confirmNotLodging: true });
  },
  /숙소가 정해졌어요/,
  () => page.getByRole("heading", { name: "숙소", level: 1 }).waitFor(),
  "06-rooms",
);

// 5. audience filter: leader-only and staff notices never reach garam
await api(op, "POST", E("/notices"), { title: "조장 모임 안내", body: "조장만", audience: [{ type: "LEADERS" }], publish: true });
await api(op, "POST", E("/notices"), { title: "운영진 집합", body: "운영진만", audience: [{ type: "STAFF" }], publish: true });
await page.waitForTimeout(32_000);
const mine = await api(garam.ctx, "GET", "/api/v1/participant/notifications");
const leaders = await api(narae.ctx, "GET", "/api/v1/participant/notifications");
const titles = (pageBody) => pageBody.items.map((item) => `${item.kind}:${item.body ?? item.title}`);
note(`대상 필터: 김가람(조원) ${mine.items.length}건 [${titles(mine).join(", ")}]`);
note(`          박나래(조장) ${leaders.items.length}건 [${titles(leaders).join(", ")}]`);
const leak = mine.items.some((item) => /조장 모임|운영진 집합/.test(`${item.title} ${item.body}`));
const leaderSees = leaders.items.some((item) => /조장 모임/.test(item.body ?? ""));
const staffLeak = leaders.items.some((item) => /운영진 집합/.test(item.body ?? ""));
note(`          조원에게 조장·운영진 공지 ${leak ? "보임(실패)" : "없음"} · 조장에게 조장 공지 ${leaderSees ? "있음" : "없음(실패)"} · 조장에게 운영진 공지 ${staffLeak ? "보임(실패)" : "없음"}`);
const list = await page.locator(".participant-inbox__rows").innerText();
note(`알림함 화면에 "조장 모임"·"운영진 집합": ${/조장 모임|운영진 집합/.test(list) ? "보임(실패)" : "없음"}`);
await shot(page, "07-inbox-all-read");

writeFileSync(`${outDir}/click-log.txt`, `${log.join("\n")}\n`);
await browser.close();
