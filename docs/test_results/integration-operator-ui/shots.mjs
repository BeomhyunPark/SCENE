// 통합 브랜치(integration/operator-ui-figma) 화면 확인. VITE_API_MOCK=1 pnpm dev 위에서 돌린다.
// 시드·로그인은 각 브랜치 기록의 스크립트를 그대로 옮겼다:
//   행사 홈 467-event-home/event-home-shots.mjs · 현장 운영 468-field-figma/shots.mjs
//   일정표 466-schedule-timetable/timetable-shots.mjs(현재 시각 2027-01-22 16:20 KST 고정)
//   회귀 화면 469-operator-shell-column/audit.mjs(신청 40명, 조 150명·15조)
// Usage: node shots.mjs <outDir> <prefix> [only=home,field,schedule,regress,clicks] [sizes=390,1440,1440c,2000]
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const [outDir = "shots", prefix = "after", onlyArg = "", sizesArg = ""] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const only = onlyArg ? onlyArg.split(",") : ["home", "field", "schedule", "regress", "clicks"];
const APP = "http://localhost:5173";
const EVENT = "00000000-0000-4000-8000-000000000020";
const OWNER = "00000000-0000-4000-8000-000000000001";
const SIZES = {
  390: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  1440: { viewport: { width: 1440, height: 1000 } },
  "1440c": { viewport: { width: 1440, height: 1000 }, collapsed: true },
  2000: { viewport: { width: 2000, height: 1100 } },
};
const sizes = sizesArg ? sizesArg.split(",") : Object.keys(SIZES);
const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
const rows = [];

async function context(size, extra = {}) {
  const { collapsed, ...opts } = SIZES[size];
  const ctx = await browser.newContext({ ...opts, deviceScaleFactor: 2, locale: "ko-KR", timezoneId: "Asia/Seoul", permissions: ["camera"], ...extra });
  await ctx.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
  await ctx.addInitScript((c) => { try { if (c) localStorage.setItem("scene.operatorSidebar.collapsed", "1"); } catch {} }, !!collapsed);
  return ctx;
}
const go = (page, path) => page.evaluate((to) => { history.pushState({}, "", to); dispatchEvent(new PopStateEvent("popstate")); }, path);
const login = (page) => page.evaluate(async (OWNER) => {
  const r = await fetch("/api/v1/operator/auth/login", { method: "POST", headers: { "Content-Type": "application/json", "X-XSRF-TOKEN": "dev-csrf" }, body: JSON.stringify({ userId: OWNER }) });
  if (!r.ok) throw new Error(`login ${r.status}`);
}, OWNER);
async function boot(page) {
  await page.goto(`${APP}/login?mockGroups=150&mockGroupCount=15`);
  await page.waitForFunction(() => window.sceneMock?.schedule && navigator.serviceWorker?.controller, null, { timeout: 20000 });
}

// 제목·본문 시작점, 본문 패딩 상자 밖으로 나간 요소, 페이지 가로 넘침, 시간표 블록 잘림을 잰다.
async function measure(page, size, screen) {
  const m = await page.evaluate(() => {
    const main = document.querySelector(".operator-shell__main");
    const title = document.querySelector(".operator-shell__heading")?.getBoundingClientRect();
    const root = main ? [...main.children].find((c) => !c.matches(".operator-shell__header, dialog")) : document.querySelector("main") ?? document.body;
    const rr = root.getBoundingClientRect();
    const cs = getComputedStyle(root);
    const L = rr.left + parseFloat(cs.paddingLeft), R = rr.right - parseFloat(cs.paddingRight);
    const clipped = (n) => { for (let p = n.parentElement; p && p !== root; p = p.parentElement) if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX)) return true; return false; };
    const out = [];
    for (const n of root.querySelectorAll("*")) {
      const r = n.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(n).position === "fixed" || n.closest("dialog")) continue;
      if ((r.left < L - 1 || r.right > R + 1) && !clipped(n) && !out.some((o) => o.el.contains(n))) out.push({ el: n, d: `${String(n.className || n.tagName).split(" ")[0]} ${Math.round(r.left - L)}/${Math.round(r.right - R)}` });
    }
    const leftOf = () => { let min = Infinity; for (const n of root.querySelectorAll("*")) { const r = n.getBoundingClientRect(); if (r.width && r.height && !n.children.length && getComputedStyle(n).position !== "fixed") min = Math.min(min, r.left); } return Math.round(min); };
    // 시간표: 블록 안 글자가 블록 밖으로 나가거나(세로) 태그가 잘리는지(가로), 현재 시각 선과 겹치는 블록
    const now = document.querySelector(".timetable__now")?.getBoundingClientRect();
    const blocks = [...document.querySelectorAll(".timetable__block")].map((b) => {
      const br = b.getBoundingClientRect();
      const kids = [...b.querySelectorAll("*")].filter((k) => k.getBoundingClientRect().height);
      const vcut = kids.some((k) => { const r = k.getBoundingClientRect(); return r.bottom > br.bottom + 0.5 && getComputedStyle(k).visibility !== "hidden"; }) || b.scrollHeight > b.clientHeight + 1;
      const hcut = kids.some((k) => k.scrollWidth > k.clientWidth + 1 && /hidden|clip/.test(getComputedStyle(k).overflowX)) || kids.some((k) => k.getBoundingClientRect().right > br.right + 0.5);
      const onLine = now && Math.abs(now.left - br.left) < br.width + now.width && now.top >= br.top && now.top <= br.bottom && now.left < br.right && now.right > br.left;
      return { t: b.innerText.split("\n")[0].slice(0, 14), h: Math.round(br.height), w: Math.round(br.width), vcut, hcut, onLine };
    }).filter((b) => b.vcut || b.hcut || b.onLine);
    return {
      title: Math.round(title?.left ?? -1), content: leftOf(), boxL: Math.round(L), boxR: Math.round(R), boxW: Math.round(R - L),
      center: main ? Math.round((L + R) / 2 - (main.getBoundingClientRect().left + main.getBoundingClientRect().right) / 2) : null,
      overflow: document.documentElement.scrollWidth > innerWidth + 1, outside: out.map((o) => o.d).slice(0, 8), blocks,
    };
  });
  const row = { size, screen, ...m };
  rows.push(row);
  console.log([size, screen, m.title, m.content, m.boxW, m.center, m.overflow ? "OVERFLOW" : "", (m.outside || []).join(" "), (m.blocks || []).map((b) => `[${b.t} ${b.h}x${b.w}${b.vcut ? " V" : ""}${b.hcut ? " H" : ""}${b.onLine ? " NOW" : ""}]`).join(" ")].join("\t"));
}
const shot = (page, name, size, full = true) => page.screenshot({ path: `${outDir}/${prefix}-${name}-${size}.png`, fullPage: full });

// 행사 홈 (467 시드)
async function home(size, status) {
  const ctx = await context(size);
  const page = await ctx.newPage();
  await boot(page);
  await page.evaluate(({ EVENT, OWNER, status }) => {
    const m = window.sceneMock;
    const day = (o) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + o * 86400000));
    if (status === "EMPTY") return;
    m.schedule.setSchedulePeriod(EVENT, day(0), day(2));
    const form = m.forms.createForm(EVENT, OWNER, {});
    const f = Object.fromEntries(form.fields.map((x) => [x.systemKey, x.fieldId]));
    const apps = ["김가람", "이나래", "박서연", "정하늘", "최민준", "한지우", "오세린", "윤도현"].map((name, i) =>
      m.participants.seedApplication(EVENT, form.formId, new Date().toISOString(), [{ fieldId: f.NAME, value: { text: name } }, { fieldId: f.PHONE, value: { text: `010-4242-00${10 + i}` } }]));
    m.participants.reviseApplication(EVENT, apps[1].applicationId, { [f.COHORT]: { text: "95" } });
    m.participants.reviseApplication(EVENT, apps[4].applicationId, { [f.COHORT]: { text: "97" } });
    m.tasks.createTask(EVENT, OWNER, { title: "숙소 배정 확인" });
    m.tasks.createTask(EVENT, OWNER, { title: "준비물 최종 수량 확정", assigneeUserId: OWNER });
    m.tasks.createTask(EVENT, OWNER, { title: "장소 계약서 업로드" });
    m.tasks.createTask(EVENT, OWNER, { title: "차량 배차표 공유" });
    [["08:00", "아침 식사", "식당", "MEAL"], ["09:30", "말씀과 묵상", "대강당", "WORSHIP"], ["13:00", "공동체 활동", "운동장", "PROGRAM"], ["18:00", "저녁 식사", "식당", "MEAL"]]
      .forEach(([startTime, title, place, category], i) => m.schedule.seedScheduleItem(EVENT, { day: i < 2 ? 2 : 3, startTime, title, place, category }));
    m.operator.setLifecycle(EVENT, status, 3);
  }, { EVENT, OWNER, status });
  await login(page);
  await go(page, `/events/${EVENT}`);
  await page.getByRole("button", { name: "행사 설정" }).waitFor();
  await page.waitForTimeout(1200);
  const name = status === "EMPTY" ? "home-new" : "home-active";
  await shot(page, name, size);
  await measure(page, size, name);
  return { ctx, page };
}

// 현장 운영 (468 시드)
async function field(size) {
  const ctx = await context(size);
  const page = await ctx.newPage();
  await boot(page);
  await page.evaluate(async ({ EVENT, OWNER }) => {
    const ops = await import("/src/mocks/operatorStore.ts");
    const checks = await import("/src/mocks/checkInStore.ts");
    const groups = await import("/src/mocks/groupStore.ts");
    ops.setLifecycle(EVENT, "ACTIVE", 2);
    const people = checks.seededParticipants();
    const id = (name, nth = 0) => people.filter((p) => p.name === name)[nth].participantId;
    const one = { groupId: "00000000-0000-4000-8000-00000000a001", name: "1조" };
    const two = { groupId: "00000000-0000-4000-8000-00000000a002", name: "2조" };
    groups.seedAssignment(EVENT, id("이수아"), { ...one, leader: true });
    groups.seedAssignment(EVENT, id("최예린"), { ...one, leader: false });
    groups.seedAssignment(EVENT, id("김하늘"), { ...two, leader: true });
    groups.seedAssignment(EVENT, id("김하람"), { ...two, leader: false });
    groups.seedAssignment(EVENT, id("박서준"), { ...two, leader: false });
    const board = groups.readBoard(EVENT, OWNER);
    groups.publish(EVENT, OWNER, { expectedBoardVersion: board.boardVersion, confirmUnassigned: true });
    checks.seedCheckIn(EVENT, id("이수아"));
    checks.seedCheckIn(EVENT, id("최예린"), "2027-01-15T01:50:00Z");
    checks.seedCheckIn(EVENT, id("박서준"), "2027-01-15T02:05:00Z");
  }, { EVENT, OWNER });
  await login(page);
  await go(page, `/events/${EVENT}/field`);
  await page.getByRole("list", { name: "체크인 명단" }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  await shot(page, "field-1-list", size); await measure(page, size, "field-1-list");
  await page.getByRole("button", { name: "조별 명단" }).click();
  await page.getByRole("list", { name: "조별 체크인 현황" }).waitFor();
  await page.getByRole("list", { name: "조별 체크인 현황" }).getByRole("button", { expanded: false }).first().click();
  await page.waitForTimeout(400);
  await shot(page, "field-2-groups", size); await measure(page, size, "field-2-groups");
  await page.getByRole("button", { name: "전체 명단" }).click();
  await page.getByRole("list", { name: "체크인 명단" }).waitFor();
  await page.getByRole("button", { name: "QR 스캔" }).click();
  await page.getByRole("region", { name: "QR 스캔" }).waitFor();
  await page.waitForTimeout(1500);
  await shot(page, "field-3-qr", size); await measure(page, size, "field-3-qr");
  await page.getByRole("button", { name: "스캔 닫기" }).click();
  await ctx.setOffline(true);
  await page.evaluate(() => dispatchEvent(new Event("offline")));
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "94 김하늘 체크인", exact: true }).first().click();
  await page.waitForTimeout(800);
  await shot(page, "field-4-offline", size); await measure(page, size, "field-4-offline");
  await ctx.setOffline(false);
  await ctx.close();
}

// 일정표 (466 시드, 현재 시각 고정)
async function schedule(size) {
  const ctx = await context(size);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date("2027-01-22T07:20:00Z"));
  await boot(page);
  await page.evaluate(({ EVENT, OWNER }) => {
    const { schedule, operator } = window.sceneMock;
    operator.setLifecycle(EVENT, "ACTIVE", 2);
    schedule.setSchedulePeriod(EVENT, "2027-01-22", "2027-01-24");
    const add = (item) => schedule.seedScheduleItem(EVENT, item);
    add({ day: 1, startTime: "13:00", endTime: "14:00", title: "도착 · 등록", place: "로비", category: "OTHER" });
    add({ day: 1, startTime: "14:00", endTime: "15:00", title: "여는 예배", place: "대강당", category: "WORSHIP" });
    add({ day: 1, startTime: "15:30", endTime: "17:30", title: "조별 나눔", place: "각 조 모임 장소", category: "GROUP" });
    add({ day: 1, startTime: "16:00", endTime: "16:15", title: "운영진 점검", place: "본부", category: "OTHER", audience: "STAFF" });
    add({ day: 1, startTime: "18:00", endTime: "19:00", title: "저녁", place: "식당", category: "MEAL", slotId: "opt_d1_dinner" });
    add({ day: 1, startTime: "19:30", endTime: "21:30", title: "저녁 집회", place: "대강당", category: "WORSHIP" });
    add({ day: 1, startTime: "21:40", title: "간식", category: "FREE" });
    add({ day: 1, startTime: "22:30", endTime: "00:30", title: "조장 모임", place: "세미나실", category: "GROUP", audience: "LEADERS" });
    add({ day: 2, startTime: "07:30", endTime: "08:30", title: "아침", place: "식당", category: "MEAL" });
    add({ day: 2, startTime: "09:00", endTime: "10:30", title: "말씀과 묵상", place: "대강당", category: "WORSHIP" });
    add({ day: 2, startTime: "13:00", endTime: "15:00", title: "공동체 활동", place: "운동장", category: "PROGRAM" });
    add({ day: 3, startTime: "09:00", endTime: "10:30", title: "마무리 예배", place: "대강당", category: "WORSHIP" });
    add({ day: 3, startTime: "11:00", endTime: "12:00", title: "정리 · 귀가", category: "MOVE" });
    schedule.publishAsOtherOperator(EVENT);
    add({ day: 1, startTime: "17:30", endTime: "17:50", title: "단체 사진", place: "본관 앞", category: "PROGRAM" });
    // 참가자 한 명(목업은 마지막 신청자로 로그인한다)
    const { forms, participants } = window.sceneMock;
    const form = forms.createForm(EVENT, OWNER, {});
    forms.setAccepting(EVENT, form.formId, OWNER, { acceptingApplications: true });
    const answers = form.fields.flatMap((field) =>
      field.systemKey === "NAME" ? [{ fieldId: field.fieldId, text: "김가람" }] : field.systemKey === "PHONE" ? [{ fieldId: field.fieldId, text: "010-2222-3300" }] : []);
    participants.submitPublicApplication(EVENT, form.formId, { answers, pin: "730914" });
  }, { EVENT, OWNER });
  await login(page);
  await go(page, `/events/${EVENT}/schedule`);
  await page.getByRole("heading", { name: "일정표" }).waitFor({ timeout: 8000 });
  await page.getByText("저녁 집회").first().waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${outDir}/${prefix}-schedule-all-${size}-viewport.png` });
  await shot(page, "schedule-all", size); await measure(page, size, "schedule-all");
  const day = page.getByRole("button", { name: "하루 보기" });
  if (await day.count()) {
    await day.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${outDir}/${prefix}-schedule-day-${size}-viewport.png` });
    await shot(page, "schedule-day", size); await measure(page, size, "schedule-day");
  }
  // 항목 편집 화면: 하단 저장 바(margin 0 -16px)
  await page.getByRole("link", { name: /여는 예배 고치기/ }).first().click();
  await page.locator(".event-schedule__actions").waitFor({ timeout: 8000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outDir}/${prefix}-schedule-item-${size}.png` });
  await measure(page, size, "schedule-item");
  // 참가자 일정 탭
  await go(page, `/participate/${EVENT}/schedule`);
  await page.getByRole("heading", { name: "일정" }).waitFor({ timeout: 8000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${outDir}/${prefix}-participant-schedule-${size}-viewport.png` });
  await shot(page, "participant-schedule", size); await measure(page, size, "participant-schedule");
  await ctx.close();
}

// 회귀 화면 (469 시드: 신청 40명, 조 150명)
async function regress(size) {
  const ctx = await context(size);
  const page = await ctx.newPage();
  await boot(page);
  await page.evaluate(async ({ EVENT, OWNER }) => {
    window.sceneMock.operator.setLifecycle(EVENT, "ACTIVE", 1);
    const h = { "content-type": "application/json", "X-XSRF-TOKEN": "dev-csrf" };
    await fetch("/api/v1/operator/auth/login", { method: "POST", headers: h, body: JSON.stringify({ userId: OWNER }) });
    const form = await (await fetch(`/api/v1/operator/events/${EVENT}/forms`, { method: "POST", headers: h, body: "{}" })).json();
    await fetch(`/api/v1/operator/events/${EVENT}/forms/${form.formId}`, { method: "PATCH", headers: h, body: JSON.stringify({ acceptingApplications: true }) });
    const detail = await (await fetch(`/api/v1/operator/events/${EVENT}/forms/${form.formId}`)).json();
    const f = Object.fromEntries(detail.fields.map((x) => [x.presetKey ?? x.systemKey, x.fieldId]));
    const fam = ["김", "이", "박", "최", "정", "강", "조", "윤"], giv = ["하늘", "서준", "수아", "예린", "민준"];
    for (let i = 0; i < 40; i += 1) {
      const answers = [{ fieldId: f.NAME, text: fam[i % 8] + giv[i % 5] }, { fieldId: f.PHONE, text: `010-42${String(10 + i).padStart(2, "0")}-${String(1000 + i)}` }];
      if (f.COHORT) answers.push({ fieldId: f.COHORT, text: String(90 + (i % 10)) });
      if (f.CONSENT) answers.push({ fieldId: f.CONSENT, value: { value: true } });
      await fetch(`/api/v1/public/events/${EVENT}/forms/${form.formId}/applications`, { method: "POST", headers: h, body: JSON.stringify({ pin: "730914", answers }) });
    }
  }, { EVENT, OWNER });
  for (const [name, path] of [["notices", "notices"], ["notifications", "notifications"], ["groups", "groups"], ["participants", "participants"], ["summary", "participants/summary"]]) {
    await go(page, `/events/${EVENT}/${path}`);
    await page.waitForSelector(".operator-shell__main", { timeout: 8000 });
    await page.waitForTimeout(1500);
    await shot(page, name, size, size === "390"); await measure(page, size, name);
  }
  await ctx.close();
}

// 행사 홈에서 실제 클릭으로 넘어가는지
async function clicks(size) {
  const targets = [
    ["참가자 카드 → 신청 집계", (p) => p.locator(".event-home__stat").filter({ hasText: "참가자" }).first(), /\/participants\/summary$/],
    ["일정 카드 → 일정표", (p) => p.locator(".event-home__stat").filter({ hasText: "일정" }).first(), /\/schedule$/],
    ["공지 모두 보기 → 공지", (p) => p.getByRole("link", { name: "모두 보기" }).first(), /\/notices/],
    ["바로가기 현장 운영", (p) => p.getByRole("navigation", { name: "바로가기" }).getByRole("link", { name: /현장 운영/ }), /\/field$/],
    ["바로가기 일정", (p) => p.getByRole("navigation", { name: "바로가기" }).getByRole("link", { name: /^일정/ }), /\/schedule$/],
    ["사이드바 현장 운영", (p) => p.locator(".operator-shell__nav, nav").getByRole("link", { name: "현장 운영" }).first(), /\/field$/],
  ];
  for (const [label, find, expect] of targets) {
    const { ctx, page } = await home(size, "ACTIVE");
    rows.pop();
    const el = find(page);
    const visible = await el.isVisible().catch(() => false);
    let result = "보이지 않음";
    if (visible) {
      await el.click();
      await page.waitForTimeout(1500);
      const path = new URL(page.url()).pathname;
      const heading = await page.locator(".operator-shell__heading").innerText().catch(() => "");
      result = `${expect.test(path) ? "OK" : "FAIL"} ${path.replace(EVENT, ":id")} 「${heading.trim()}」`;
    }
    rows.push({ size, screen: "click", label, result });
    console.log(`${size}\tclick\t${label}\t${result}`);
    await ctx.close();
  }
}

for (const size of sizes) {
  if (only.includes("home")) { for (const s of ["ACTIVE", "EMPTY"]) { const { ctx } = await home(size, s); await ctx.close(); } }
  if (only.includes("field")) await field(size);
  if (only.includes("schedule")) await schedule(size);
  if (only.includes("regress")) await regress(size);
  if (only.includes("clicks") && (size === "390" || size === "1440")) await clicks(size);
}
await browser.close();
writeFileSync(`${outDir}/${prefix}-measure.json`, JSON.stringify(rows, null, 1));
