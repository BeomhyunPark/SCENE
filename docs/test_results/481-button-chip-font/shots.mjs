// 버튼·칩 글씨 크기 전/후 확인 (VITE_API_MOCK=1 pnpm dev). Usage: node shots.mjs <outDir> <before|after>
// 각 화면을 1440·390에서 찍고, 공지 필터 칩·식수 카드 버튼·48 버튼의 글씨 크기와 칩 높이를 출력한다.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const [outDir, prefix = "after"] = process.argv.slice(2);
const APP = "http://localhost:5173";
const EVENT = "00000000-0000-4000-8000-000000000020";
const OWNER = "00000000-0000-4000-8000-000000000001";
const e = `/events/${EVENT}`;
const operatorScreens = [
  ["notices", `${e}/notices`], ["notice-new", `${e}/notices/new`], ["meals", `${e}/meals`], ["schedule", `${e}/schedule`],
  ["tasks", `${e}/tasks`], ["events", "/events"], ["setup", `${e}/participants/setup`],
];
const publicScreens = [["login", "/login"], ["signup", "/signup"]];
const sizes = [
  ["1440", { viewport: { width: 1440, height: 900 } }],
  ["390", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
];
const measure = (page) => page.evaluate(() => {
  const pick = (sel) => [...document.querySelectorAll(sel)].slice(0, 3).map((n) => {
    const s = getComputedStyle(n); const r = n.getBoundingClientRect();
    return `${(n.textContent || "").trim().slice(0, 12)} ${s.fontSize}/${s.lineHeight} h${Math.round(r.height)}`;
  });
  return {
    filter: pick(".notices__filter, .notice-form__choice"),
    btn48: pick(".scene-button--size-48"),
    btn40: pick(".scene-button--size-40"),
  };
});
const browser = await chromium.launch();
const go = (page, path) => page.evaluate((to) => { history.pushState({}, "", to); dispatchEvent(new PopStateEvent("popstate")); }, path);
const rows = [];
for (const [label, opts] of sizes) {
  const ctx = await browser.newContext({ ...opts, deviceScaleFactor: 2, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  await ctx.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
  const page = await ctx.newPage();
  for (const [name, path] of publicScreens) {
    await page.goto(`${APP}${path}`); await page.waitForTimeout(1500);
    await page.screenshot({ path: `${outDir}/${prefix}-${name}-${label}.png`, fullPage: label === "390" });
    rows.push({ label, name, ...(await measure(page)) });
  }
  await page.goto(`${APP}/`);
  await page.waitForFunction(() => window.sceneMock?.schedule && navigator.serviceWorker?.controller, null, { timeout: 20000 });
  await page.evaluate(async ({ EVENT, OWNER }) => {
    const { schedule, operator } = window.sceneMock;
    operator.setLifecycle(EVENT, "ACTIVE", 1);
    schedule.setSchedulePeriod(EVENT, "2026-11-24", "2026-11-26");
    const add = (item) => schedule.seedScheduleItem(EVENT, item);
    add({ day: 1, startTime: "15:00", endTime: "16:00", title: "도착 · 등록", place: "로비", category: "MOVE" });
    add({ day: 1, startTime: "18:00", endTime: "19:00", title: "저녁", place: "식당", category: "MEAL", slotId: "opt_d1_dinner" });
    add({ day: 1, startTime: "19:30", endTime: "21:30", title: "저녁 집회", place: "대강당", category: "WORSHIP" });
    add({ day: 2, startTime: "07:30", endTime: "08:30", title: "아침", place: "식당", category: "MEAL" });
    add({ day: 2, startTime: "09:00", endTime: "10:30", title: "말씀과 묵상", place: "대강당", category: "WORSHIP" });
    add({ day: 3, startTime: "09:00", endTime: "10:30", title: "마무리 예배", place: "대강당", category: "WORSHIP" });
    schedule.publishAsOtherOperator(EVENT);
    const h = { "Content-Type": "application/json", "X-XSRF-TOKEN": "dev-csrf" };
    await fetch("/api/v1/operator/auth/login", { method: "POST", headers: h, body: JSON.stringify({ userId: OWNER }) });
    const ev = `/api/v1/operator/events/${EVENT}`;
    const { formId } = await (await fetch(`${ev}/forms`, { method: "POST", headers: h, body: "{}" })).json();
    const sched = [{ breakfast: false, lunch: false, dinner: true, worship: true }, { breakfast: true, lunch: true, dinner: true, worship: true }, { breakfast: true, lunch: true, dinner: false, worship: false }];
    await fetch(`${ev}/forms/${formId}/setup`, { method: "PUT", headers: h, body: JSON.stringify({ gender: false, middleGroup: false, cell: false, attendance: { partial: false, worshipOnly: false, mode: "RANGE" }, schedule: sched, transport: { groupBus: false, worshipShuttle: false, car: false, publicTransit: false, support: false } }) });
    await fetch(`${ev}/forms/${formId}`, { method: "PATCH", headers: h, body: JSON.stringify({ acceptingApplications: true }) });
    const detail = await (await fetch(`${ev}/forms/${formId}`)).json();
    const f = Object.fromEntries(detail.fields.map((x) => [x.presetKey ?? x.systemKey, x.fieldId]));
    const names = ["김하늘", "이서준", "박수아", "최예린", "정민준", "김가람"];
    for (let i = 0; i < names.length; i += 1) {
      const a = [{ fieldId: f.NAME, text: names[i] }, { fieldId: f.PHONE, text: `010-2222-33${String(i).padStart(2, "0")}` }];
      if (f.COHORT) a.push({ fieldId: f.COHORT, text: "95" });
      if (f.CONSENT) a.push({ fieldId: f.CONSENT, value: { value: true } });
      if (f.ATTENDANCE) a.push({ fieldId: f.ATTENDANCE, value: { optionId: "opt_full" } });
      await fetch(`/api/v1/public/events/${EVENT}/forms/${formId}/applications`, { method: "POST", headers: h, body: JSON.stringify({ pin: "730914", answers: a }) });
    }
  }, { EVENT, OWNER });
  for (const [name, path] of operatorScreens) {
    try {
      await go(page, path);
      const enter = page.getByRole("button", { name: "들어가기" });
      await page.waitForSelector(".operator-shell__main, button:has-text('들어가기')", { timeout: 8000 });
      if (await enter.count()) { await enter.click(); await page.waitForSelector(".operator-shell__main", { timeout: 8000 }); }
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${outDir}/${prefix}-${name}-${label}.png`, fullPage: label === "390" });
      rows.push({ label, name, ...(await measure(page)) });
    } catch (err) { rows.push({ label, name, error: String(err).slice(0, 120) }); }
  }
  if (label === "390") {
    await go(page, `/participate/${EVENT}/schedule`);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${outDir}/${prefix}-participant-schedule-${label}.png`, fullPage: true });
  }
  await ctx.close();
}
await browser.close();
writeFileSync(`${outDir}/${prefix}-measure.json`, JSON.stringify(rows, null, 1));
for (const r of rows) console.log(r.label, r.name, JSON.stringify(r.filter ?? r.error), JSON.stringify(r.btn48), JSON.stringify(r.btn40));
