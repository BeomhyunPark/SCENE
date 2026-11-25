// #466 follow-up: an event day with no items yet, at 11:25 on that day (Seoul). The timetable still
// shows 07:00–24:00 with the current-time line; tapping free time (phone) or dragging (desktop) opens
// the new-item form with that time. Mock server (VITE_API_MOCK=1), seeded through window.sceneMock.
// Usage: node empty-day-shots.mjs <appUrl> <outDir>
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const [APP, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const EVENT = "00000000-0000-4000-8000-000000000020";
const NOW = new Date("2027-01-22T02:25:00Z"); // 11:25 on day 1 in Seoul

const browser = await chromium.launch();
const sizes = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 },
};
for (const size of ["phone", "desktop"]) {
  const ctx = await browser.newContext({ ...sizes[size], locale: "ko-KR", timezoneId: "Asia/Seoul" });
  await ctx.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  await page.goto(`${APP}/`);
  await page.waitForFunction(() => window.sceneMock?.schedule);
  await page.evaluate((EVENT) => {
    window.sceneMock.operator.setLifecycle(EVENT, "ACTIVE", 2);
    window.sceneMock.schedule.setSchedulePeriod(EVENT, "2027-01-22", "2027-01-24");
  }, EVENT);
  await page.evaluate((to) => {
    window.history.pushState({}, "", to);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, `/events/${EVENT}/schedule`);
  const enter = page.getByRole("button", { name: "들어가기" });
  await Promise.race([page.getByRole("heading", { name: "일정표" }).waitFor(), enter.waitFor()]);
  if (await enter.count()) await enter.click();
  await page.getByText("빈 시간을 누르거나 끌어서 일정을 추가할 수 있어요.").waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${outDir}/14-empty-day-${size}.png` });
  console.log(`${size}: now line ${await page.locator(".timetable__now").count()}`);
  const column = page.locator(".timetable__column--pick").first();
  const box = await column.boundingBox();
  const scale = size === "phone" ? 1.4 : 1.2;
  const y = (minute) => box.y + 2 + (minute - 7 * 60) * scale; // the axis starts at 07:00
  if (size === "desktop") {
    // Drag 14:00 → 15:30 with the mouse and look at the draft block before letting go.
    await page.mouse.move(box.x + 60, y(14 * 60 + 5));
    await page.mouse.down();
    await page.mouse.move(box.x + 60, y(15 * 60 + 20), { steps: 8 });
    await page.screenshot({ path: `${outDir}/15-drag-${size}.png` });
    await page.mouse.up();
  } else {
    await page.mouse.click(box.x + 60, y(14 * 60 + 5));
  }
  const form = page.getByRole("form", { name: "일정 추가" });
  await form.waitFor();
  console.log(`${size}: form start ${await form.getByLabel("시작").inputValue()} end ${await form.getByLabel("끝 (선택)").inputValue()}`);
  await page.screenshot({ path: `${outDir}/16-picked-form-${size}.png` });
  await ctx.close();
}
await browser.close();
