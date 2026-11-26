// #483 화면 군더더기 조사: 운영자·참가자·공개 화면을 1440·390으로 찍고, 화면마다 보이는 버튼·링크·입력 칸·문구를 뽑는다.
// VITE_API_MOCK=1 pnpm dev 위에서 돌린다. 시드는 integration-operator-ui/audit.mjs(신청 40명, 일정 9개, 조 150명·15조)에 업무·공지를 더했다.
// Usage: node capture.mjs <outDir> <prefix> [only=name1,name2] [sizes=1440,390]
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const [outDir = "before", prefix = "before", onlyArg = "", sizesArg = "1440,390"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const only = onlyArg ? onlyArg.split(",") : null;
const APP = "http://localhost:5173";
const EVENT = "00000000-0000-4000-8000-000000000020";
const SPACE = "00000000-0000-4000-8000-000000000010";
const OWNER = "00000000-0000-4000-8000-000000000001";
const SIZES = {
  1440: { viewport: { width: 1440, height: 900 } },
  390: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
};
const e = `/events/${EVENT}`;
const OPERATOR = [
  ["events", "/events"], ["event-new", "/events/new"], ["home", e], ["participants", `${e}/participants`],
  ["application", `${e}/participants/:app`], ["application-edit", `${e}/participants/:app/edit`], ["participant-add", `${e}/participants/new`],
  ["setup", `${e}/participants/setup`], ["summary", `${e}/participants/summary`],
  ["tasks", `${e}/tasks`], ["task", `${e}/tasks/:task`], ["schedule", `${e}/schedule`], ["schedule-item", `${e}/schedule/:item`],
  ["notices", `${e}/notices`], ["notice-new", `${e}/notices/new`], ["notice", `${e}/notices/:notice`],
  ["notifications", `${e}/notifications`], ["groups", `${e}/groups`], ["field", `${e}/field`], ["meals", `${e}/meals`],
  ["rooms", `${e}/rooms`], ["operators", `${e}/operators`], ["event-settings", `${e}/settings`], ["areas", `${e}/areas`],
  ["end", `${e}/end`], ["members", "/members"], ["org-settings", "/settings"], ["org-notifications", "/notifications"],
  ["history", "/history"], ["guides", "/guides"], ["leave", "/spaces/:space/leave"],
];
const PUBLIC = [["public-home", "/"], ["login", "/login"], ["privacy", "/privacy"], ["apply", `/apply/${EVENT}/:form`]];
const PARTICIPANT = [
  ["p-home", `/participate/${EVENT}`], ["p-schedule", `/participate/${EVENT}/schedule`], ["p-notices", `/participate/${EVENT}/notices`],
  ["p-group", `/participate/${EVENT}/group`], ["p-me", `/participate/${EVENT}/me`], ["p-rooms", `/participate/${EVENT}/rooms`],
  ["p-inbox", `/participate/${EVENT}/inbox`],
];
const sizes = sizesArg.split(",");
const browser = await chromium.launch();
import { existsSync, readFileSync } from "node:fs";
const invPath = `${outDir}/${prefix}-inventory.json`;
const inventory = only && existsSync(invPath) ? JSON.parse(readFileSync(invPath, "utf8")) : {};

// 화면에 보이는 것: 버튼·링크·입력 칸·제목·문구. 사이드바·하단 탭·목업 배너는 따로 센다.
const extract = () => {
  const vis = (n) => { const r = n.getBoundingClientRect(); const s = getComputedStyle(n); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const root = document.querySelector(".operator-shell__main") ?? document.querySelector("main") ?? document.body;
  const chrome = (n) => n.closest(".operator-shell__sidebar, nav, .mock-banner, [class*='bottom-nav'], [class*='mock-banner']") && !root.contains(n.closest("nav")) ;
  const name = (n) => (n.getAttribute("aria-label") || n.innerText || n.value || n.getAttribute("title") || "").replace(/\s+/g, " ").trim().slice(0, 60);
  const label = (n) => {
    const id = n.id && document.querySelector(`label[for="${CSS.escape(n.id)}"]`);
    return (n.getAttribute("aria-label") || id?.innerText || n.closest("label")?.innerText || n.getAttribute("placeholder") || n.name || n.type || "").replace(/\s+/g, " ").trim().slice(0, 50);
  };
  const out = { buttons: [], links: [], inputs: [], headings: [], texts: [] };
  for (const n of root.querySelectorAll("button, [role=button]")) if (vis(n) && !n.closest("dialog:not([open])")) out.buttons.push({ t: name(n), disabled: n.disabled || n.getAttribute("aria-disabled") === "true" });
  for (const n of root.querySelectorAll("a[href]")) if (vis(n)) out.links.push({ t: name(n), href: n.getAttribute("href") });
  for (const n of root.querySelectorAll("input, textarea, select, [role=combobox]")) if (vis(n) || n.type === "checkbox" || n.type === "radio") out.inputs.push({ t: label(n), type: n.type || n.tagName.toLowerCase() });
  for (const n of root.querySelectorAll("h1, h2, h3, h4, legend")) if (vis(n)) out.headings.push(`${n.tagName}: ${n.innerText.replace(/\s+/g, " ").trim().slice(0, 80)}`);
  for (const n of root.querySelectorAll("p, small, [class*='hint'], [class*='lead'], [class*='desc'], [class*='count'], [class*='subtitle'], [class*='caption']")) {
    if (!vis(n) || n.closest("button, a, table, li li") ) continue;
    const t = n.innerText.replace(/\s+/g, " ").trim();
    if (t && t.length < 200 && !out.texts.includes(t)) out.texts.push(t);
  }
  out.title = document.querySelector(".operator-shell__heading")?.innerText ?? document.title;
  return out;
};

async function newCtx(size) {
  const ctx = await browser.newContext({ ...SIZES[size], deviceScaleFactor: 2, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  await ctx.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
  return ctx;
}
const go = (page, path) => page.evaluate((to) => { history.pushState({}, "", to); dispatchEvent(new PopStateEvent("popstate")); }, path);

async function seed(page) {
  await page.goto(`${APP}/login?mockGroups=150&mockGroupCount=15`);
  await page.waitForFunction(() => window.sceneMock?.schedule && navigator.serviceWorker?.controller, null, { timeout: 20000 });
  return page.evaluate(async ({ EVENT, OWNER }) => {
    const m = window.sceneMock;
    m.operator.setLifecycle(EVENT, "ACTIVE", 1);
    m.schedule.setSchedulePeriod(EVENT, "2027-01-22", "2027-01-24");
    const seedItem = (day, startTime, endTime, title, place, category) => m.schedule.seedScheduleItem(EVENT, { day, startTime, endTime, title, place, category });
    const first = seedItem(1, "15:00", "16:00", "도착·등록", "로비", "MOVE");
    seedItem(1, "18:00", "19:00", "저녁 식사", "식당", "MEAL");
    seedItem(1, "19:30", "21:30", "여는 예배", "본당", "WORSHIP");
    seedItem(2, "07:30", "08:30", "아침 식사", "식당", "MEAL");
    seedItem(2, "09:00", "10:30", "아침 예배", "본당", "WORSHIP");
    seedItem(2, "10:45", "12:00", "조별 모임", "소그룹실", "GROUP");
    seedItem(3, "09:30", "11:00", "닫는 예배", "본당", "WORSHIP");
    m.schedule.publishAsOtherOperator(EVENT);
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
      await fetch(`/api/v1/public/events/${EVENT}/forms/${form.formId}/applications`, { method: "POST", headers: h, body: JSON.stringify({ pin: "730914", answers }) });
    }
    // 마지막 신청 뒤 참가자 세션이 생기므로 운영자로 다시 로그인한다
    await fetch("/api/v1/operator/auth/login", { method: "POST", headers: h, body: JSON.stringify({ userId: OWNER }) });
    for (const title of ["숙소 배정 확인", "준비물 최종 수량 확정", "장소 계약서 업로드"]) m.tasks.createTask(EVENT, OWNER, { title });
    const notice = await (await fetch(`/api/v1/operator/events/${EVENT}/notices`, { method: "POST", headers: h,
      body: JSON.stringify({ title: "첫째 날 집합 안내", body: "오후 2시 30분까지 로비로 와 주세요.", audience: [{ type: "ALL" }], publish: true }) })).json();
    const tasks = await (await fetch(`/api/v1/operator/events/${EVENT}/tasks`)).json();
    const apps = await (await fetch(`/api/v1/operator/events/${EVENT}/applications`)).json();
    const sched = await (await fetch(`/api/v1/operator/events/${EVENT}/schedule`)).json().catch(() => ({}));
    return { task: (tasks.items ?? tasks)[0]?.taskId, app: (apps.items ?? apps)[0]?.applicationId, notice: notice.noticeId ?? notice.notice?.noticeId ?? ((await (await fetch(`/api/v1/operator/events/${EVENT}/notices`)).json()).items ?? [])[0]?.noticeId,
      space: ((await (await fetch("/api/v1/operator/spaces")).json()).items ?? [])[0]?.spaceId,
      item: first?.itemId ?? (sched.items ?? [])[0]?.itemId, form: form.formId };
  }, { EVENT, OWNER });
}

async function visit(page, name, raw, ids, size, nav) {
  if (only && !only.includes(name)) return;
  const path = raw.replace(":task", ids.task).replace(":app", ids.app).replace(":notice", ids.notice).replace(":item", ids.item).replace(":form", ids.form).replace(":space", ids.space);
  try {
    if (nav === "goto") await page.goto(`${APP}${path}`); else await go(page, path);
    await page.waitForTimeout(1600);
    await shot(page, name, size);
    const inv = await page.evaluate(extract);
    (inventory[name] ??= { path: raw })[size] = inv;
    console.log(size, name, `b${inv.buttons.length} l${inv.links.length} i${inv.inputs.length} t${inv.texts.length}`);
  } catch (err) { console.log(size, name, "ERROR", String(err).slice(0, 120)); }
}
const shot = (page, name, size) => page.screenshot({ path: `${outDir}/${prefix}-${name}-${size}.png`, fullPage: true });

for (const size of sizes) {
  const ctx = await newCtx(size);
  const page = await ctx.newPage();
  const ids = await seed(page);
  console.log("ids", JSON.stringify(ids));
  for (const [name, raw] of OPERATOR) await visit(page, name, raw, ids, size);
  // 회고: 종료된 행사에서만 보인다
  await page.evaluate((EVENT) => window.sceneMock.operator.setLifecycle(EVENT, "ENDED", 9), EVENT);
  await visit(page, "retrospective", `${e}/retrospective`, ids, size);
  await page.evaluate((EVENT) => window.sceneMock.operator.setLifecycle(EVENT, "ACTIVE", 10), EVENT);
  // 참가자: 마지막 신청자 세션으로 들어간다(공개 신청 한 번 더)
  await page.evaluate(async ({ EVENT, form }) => {
    const h = { "content-type": "application/json", "X-XSRF-TOKEN": "dev-csrf" };
    const detail = await (await fetch(`/api/v1/operator/events/${EVENT}/forms/${form}`)).json();
    const f = Object.fromEntries(detail.fields.map((x) => [x.presetKey ?? x.systemKey, x.fieldId]));
    const answers = [{ fieldId: f.NAME, text: "김가람" }, { fieldId: f.PHONE, text: "010-2222-3300" }];
    if (f.COHORT) answers.push({ fieldId: f.COHORT, text: "95" });
    await fetch(`/api/v1/public/events/${EVENT}/forms/${form}/applications`, { method: "POST", headers: h, body: JSON.stringify({ pin: "730914", answers }) });
  }, { EVENT, form: ids.form });
  await page.evaluate(({ EVENT, OWNER }) => { const g = window.sceneMock.groups; try { const b = g.readBoard(EVENT, OWNER); g.publish(EVENT, OWNER, { expectedBoardVersion: b.boardVersion, confirmUnassigned: true }); } catch (e) { console.log(e); } }, { EVENT, OWNER });
  for (const [name, raw] of PARTICIPANT) await visit(page, name, raw, ids, size);
  for (const [name, raw] of PUBLIC) await visit(page, name, raw, ids, size);
  await ctx.close();
}
await browser.close();
writeFileSync(`${outDir}/${prefix}-inventory.json`, JSON.stringify(inventory, null, 1));
