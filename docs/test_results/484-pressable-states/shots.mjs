// 눌리는 요소 반응 표시 전·후 (VITE_API_MOCK=1 pnpm dev on :5173). Usage: node shots.mjs <outDir> <prefix> [only]
// 각 화면에서 대상 요소의 기본·hover(·포커스) 상태를 찍고, 계산된 cursor·배경·테두리를 출력한다.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const [outDir, prefix, only] = process.argv.slice(2);
const APP = "http://localhost:5173";
const EVENT = "00000000-0000-4000-8000-000000000020";
const OWNER = "00000000-0000-4000-8000-000000000001";
// [name, path, selector, {focus, width, clip}]
const SCREENS = [
  ["01-event-list", "/events", ".event-list__row", { focus: true }],
  ["02-tasks", `/events/${EVENT}/tasks?view=list`, ".event-tasks__rows button", { focus: true }],
  ["03-notices", `/events/${EVENT}/notices`, ".notice-row", {}],
  ["04-notices-filter", `/events/${EVENT}/notices`, ".notices__filter:not([aria-pressed=true])", {}],
  ["05-event-home-task", `/events/${EVENT}`, ".event-home__task", {}],
  ["06-participation-card", `/events/${EVENT}/participants`, ".event-home__card.scene-press, .event-home__card", {}],
  ["07-schedule-day", `/events/${EVENT}/schedule`, ".event-schedule__day:not([aria-selected=true])", {}],
  ["08-notifications", `/events/${EVENT}/notifications`, ".event-notifications__item", {}],
  ["10-event-list-390", "/events", ".event-list__row", { width: 390, noHover: true }],
  ["11-tasks-390", `/events/${EVENT}/tasks?view=list`, ".event-tasks__rows button", { width: 390, noHover: true }],
];
const browser = await chromium.launch();
const report = [];
for (const [name, path, sel, opt] of SCREENS) {
  if (only && !name.includes(only)) continue;
  const width = opt.width ?? 1440;
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, deviceScaleFactor: 2, locale: "ko-KR", timezoneId: "Asia/Seoul", ...(width < 500 ? { isMobile: true, hasTouch: true } : {}) });
  await ctx.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
  const page = await ctx.newPage();
  await page.goto(`${APP}/login`);
  await page.waitForFunction(() => window.sceneMock?.operator && navigator.serviceWorker?.controller, null, { timeout: 20000 });
  await page.evaluate(async ({ EVENT, OWNER }) => {
    window.sceneMock.operator.setLifecycle(EVENT, "ACTIVE", 1);
    const post = (url, body) => fetch(url, { method: "POST", headers: { "content-type": "application/json", "X-XSRF-TOKEN": "dev-csrf" }, body: JSON.stringify(body) });
    await post("/api/v1/operator/auth/login", { userId: OWNER });
    // 화면에 행이 있도록 업무·공지를 몇 개 만든다(목업 저장소, 페이지 안에서만 산다).
    for (const title of ["숙소 예약 확정", "버스 대절 견적 받기", "명찰 인쇄"]) await post(`/api/v1/operator/events/${EVENT}/tasks`, { title });
    await post(`/api/v1/operator/events/${EVENT}/notices`, { title: "출발 시간 안내", body: "토요일 오전 9시에 교회 앞에서 출발해요.", important: false, pinned: false, audience: [{ type: "ALL" }], publish: true });
    await post(`/api/v1/operator/events/${EVENT}/notices`, { title: "준비물 안내", body: "성경, 세면도구, 개인 약을 챙겨 주세요.", important: true, pinned: false, audience: [{ type: "ALL" }], publish: true });
  }, { EVENT, OWNER });
  await page.evaluate((p) => { history.pushState({}, "", p); dispatchEvent(new PopStateEvent("popstate")); }, path);
  await page.waitForTimeout(1500);
  const el = page.locator(sel).first();
  const found = await el.count();
  const style = async () => found ? el.evaluate((e) => { const s = getComputedStyle(e); return `${s.cursor} bg=${s.backgroundColor} border=${s.borderColor} outline=${s.outlineStyle}/${s.outlineColor}`; }) : "없음";
  await page.mouse.move(2, 2);
  await page.screenshot({ path: `${outDir}/${prefix}-${name}-default.png` });
  const rest = await style();
  let hover = "-";
  if (found && !opt.noHover) {
    await el.scrollIntoViewIfNeeded();
    await el.hover();
    await page.waitForTimeout(250);
    hover = await style();
    await page.screenshot({ path: `${outDir}/${prefix}-${name}-hover.png` });
  }
  let focus = "-";
  if (found && opt.focus) {
    await page.mouse.move(2, 2);
    await el.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await page.waitForTimeout(250);
    focus = await style();
    await page.screenshot({ path: `${outDir}/${prefix}-${name}-focus.png` });
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  report.push({ name, found, rest, hover, focus, overflow });
  console.log(name, found, "\n  rest ", rest, "\n  hover", hover, "\n  focus", focus, "\n  overflow", overflow);
  await ctx.close();
}
await browser.close();
writeFileSync(`${outDir}/${prefix}-report.json`, JSON.stringify(report, null, 1));
