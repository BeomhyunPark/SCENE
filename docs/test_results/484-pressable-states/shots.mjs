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
  ["02-event-home", `/events/${EVENT}`, ".event-home__module, .event-home__stat, .event-home__card", {}],
  ["03-tasks", `/events/${EVENT}/tasks`, ".event-tasks__row, .event-tasks__item, .event-tasks__task", {}],
  ["04-notices", `/events/${EVENT}/notices`, ".notices__row, .notices__item", {}],
  ["05-members", "/members", ".space-members__row, .space-members__item", {}],
  ["06-notifications", "/notifications", ".event-notifications__item", {}],
  ["07-groups", `/events/${EVENT}/groups`, ".event-groups__card, .event-groups__member", {}],
  ["08-participants", `/events/${EVENT}/participants`, ".applicant-table__row, .applicant-table__name", {}],
  ["09-settings", `/events/${EVENT}/settings`, ".event-settings__item, .event-settings__row", {}],
  ["10-event-list-390", "/events", ".event-list__row", { width: 390, noHover: true }],
  ["11-event-home-390", `/events/${EVENT}`, ".event-home__module", { width: 390, noHover: true }],
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
    await fetch("/api/v1/operator/auth/login", { method: "POST", headers: { "content-type": "application/json", "X-XSRF-TOKEN": "dev-csrf" }, body: JSON.stringify({ userId: OWNER }) });
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
