// #475: 준비 업무 month view against Vite with VITE_API_MOCK=1. Tasks and the event period are seeded
// through window.sceneMock; the clock is pinned to 2027-01-05 (Seoul) so 오늘 and past-due show.
// Usage: node task-month-shots.mjs <appUrl> <outDir>
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const [APP, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const EVENT = "00000000-0000-4000-8000-000000000020";
const OWNER = "00000000-0000-4000-8000-000000000001";
const MANAGER = "00000000-0000-4000-8000-000000000002";

const browser = await chromium.launch();
const sizes = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2 },
};
for (const size of ["desktop", "phone"]) {
  const ctx = await browser.newContext({ ...sizes[size], locale: "ko-KR", timezoneId: "Asia/Seoul" });
  await ctx.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date("2027-01-05T03:00:00Z"));
  await page.goto(`${APP}/`);
  await page.waitForFunction(() => window.sceneMock?.tasks && window.sceneMock?.schedule);
  await page.evaluate(({ EVENT, OWNER, MANAGER }) => {
    const { tasks, schedule, operator } = window.sceneMock;
    operator.setLifecycle(EVENT, "ACTIVE", 2);
    schedule.setSchedulePeriod(EVENT, "2027-01-22", "2027-01-24");
    const add = (body) => tasks.createTask(EVENT, OWNER, body);
    add({ title: "장소 계약금 입금", dueDate: "2027-01-03" });
    add({ title: "신청서 마감 안내", startDate: "2027-01-04", dueDate: "2027-01-06", assigneeUserId: MANAGER });
    add({ title: "숙소 방 배정", startDate: "2027-01-11", dueDate: "2027-01-15" });
    add({ title: "명찰 주문", dueDate: "2027-01-08" });
    add({ title: "차량 배차표", startDate: "2027-01-14", dueDate: "2027-01-19" });
    add({ title: "간식 구매", dueDate: "2027-01-21" });
    add({ title: "현장 체크인 리허설", dueDate: "2027-01-21" });
    add({ title: "음향 장비 대여", dueDate: "2027-01-21" });
    add({ title: "강사 숙소 확인", dueDate: "2027-01-21" });
    const done = add({ title: "안내 영상 촬영", dueDate: "2027-01-02" });
    tasks.completeTask(EVENT, done.taskId, OWNER, done.version);
  }, { EVENT, OWNER, MANAGER });
  await page.evaluate((to) => {
    window.history.pushState({}, "", to);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, `/events/${EVENT}/tasks`);
  const enter = page.getByRole("button", { name: "들어가기" });
  await Promise.race([page.getByRole("button", { name: "월" }).waitFor(), enter.waitFor()]);
  if (await enter.count()) await enter.click();
  await page.getByRole("button", { name: "월" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outDir}/${size}-month.png`, fullPage: true });
  if (size === "desktop") {
    // Drag from the 18th to the 20th: the cells light up, then the form gets the period.
    const cell = (day) => page.getByRole("gridcell", { name: new RegExp(`^1월 ${day}일`) });
    const a = await cell(18).boundingBox();
    const b = await cell(20).boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height - 12);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height - 12, { steps: 6 });
    await page.screenshot({ path: `${outDir}/${size}-month-drag.png` });
    await page.mouse.up();
    console.log(`desktop picked: ${await page.getByLabel("시작일 (선택)").inputValue()} ~ ${await page.getByLabel("마감일 (선택)").inputValue()}`);
    await page.screenshot({ path: `${outDir}/${size}-month-picked.png` });
  }
  await ctx.close();
}
await browser.close();
