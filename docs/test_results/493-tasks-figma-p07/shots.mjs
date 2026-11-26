// #493: 준비 업무 목록·상세 전/후 캡처 (VITE_API_MOCK=1). 시계는 2027-01-05(서울)로 고정.
// Usage: node shots.mjs <appUrl> <outDir> <before|after>
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const [APP, outDir, phase] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const EVENT = "00000000-0000-4000-8000-000000000020";
const OWNER = "00000000-0000-4000-8000-000000000001";
const MANAGER = "00000000-0000-4000-8000-000000000002";
const SEEDED = "00000000-0000-4000-8000-000000000040";

const browser = await chromium.launch();
const sizes = {
  390: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  1440: { viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 },
};
const log = (...a) => console.log(phase, ...a);

async function go(page, to) {
  await page.evaluate((to) => {
    window.history.pushState({}, "", to);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, to);
}

for (const size of [1440, 390]) {
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
    add({ title: "신청서 마감 안내", startDate: "2027-01-04", dueDate: "2027-01-06", assigneeUserId: MANAGER });
    add({ title: "숙소 방 배정", startDate: "2027-01-11", dueDate: "2027-01-15" });
    add({ title: "명찰 주문", dueDate: "2027-01-08" });
    const done = add({ title: "안내 영상 촬영", dueDate: "2027-01-02" });
    tasks.completeTask(EVENT, done.taskId, OWNER, done.version);
  }, { EVENT, OWNER, MANAGER });
  await go(page, `/events/${EVENT}/tasks`);
  const enter = page.getByRole("button", { name: "들어가기" });
  await Promise.race([page.getByRole("button", { name: "월" }).waitFor(), enter.waitFor()]);
  if (await enter.count()) await enter.click();
  await page.getByRole("button", { name: "월" }).waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/${phase}-list-${size}.png`, fullPage: true });

  if (phase === "after") {
    // 만들기 서랍: 버튼으로 열고, 채워서 만들고, 목록에 생겼는지 본다.
    const opener = page.getByRole("button", { name: "업무 추가" }).first();
    await opener.click();
    const drawer = page.getByRole("dialog", { name: "새 업무 만들기" });
    await drawer.waitFor();
    log(size, "drawer focus on:", await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.id));
    await page.screenshot({ path: `${outDir}/after-create-drawer-${size}.png` });
    // 담당자(공용 Select): 열고 Esc → 목록만 닫히고 서랍은 남는다. 그다음 Local manager를 고른다.
    const assignee = drawer.getByRole("combobox", { name: "담당자" });
    await assignee.click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${outDir}/after-create-assignee-${size}.png` });
    await page.keyboard.press("Escape");
    log(size, "esc on open select keeps drawer:", await drawer.isVisible());
    await assignee.click();
    await page.getByRole("option", { name: "Local manager" }).click();
    await drawer.getByLabel("업무명").fill("간식 구매");
    await drawer.getByLabel("마감일").fill("2027-01-21");
    await drawer.getByRole("button", { name: "업무 만들기" }).click();
    await drawer.waitFor({ state: "detached" });
    log(size, "created row with assignee:", await page.getByRole("button", { name: /간식 구매.*Local manager/ }).isVisible());
    log(size, "focus back on opener:", await page.evaluate(() => document.activeElement?.textContent?.trim()));
    // Esc 로 닫기
    await opener.click();
    await drawer.waitFor();
    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "detached" });
    log(size, "esc closed drawer");
  }

  await page.getByRole("button", { name: "월" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/${phase}-month-${size}.png`, fullPage: true });
  if (size === 1440) {
    const cell = (day) => page.getByRole("gridcell", { name: new RegExp(`^1월 ${day}일`) });
    const a = await cell(18).boundingBox();
    const b = await cell(20).boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height - 12);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height - 12, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    log(size, "month pick:", await page.getByLabel(/시작일/).first().inputValue(), "~", await page.getByLabel(/마감일/).first().inputValue());
    await page.screenshot({ path: `${outDir}/${phase}-month-picked-${size}.png` });
    if (phase === "after") {
      const drawer = page.getByRole("dialog", { name: "새 업무 만들기" });
      await drawer.getByLabel("업무명").fill("차량 배차표");
      await drawer.getByRole("button", { name: "업무 만들기" }).click();
      await drawer.waitFor({ state: "detached" });
      log(size, "month-created bar:", await page.getByRole("gridcell", { name: /^1월 19일/ }).getByRole("button", { name: "차량 배차표" }).isVisible());
    }
  } else if (phase === "after") {
    await page.getByRole("button", { name: "+ 업무" }).first().click();
    const drawer = page.getByRole("dialog", { name: "새 업무 만들기" });
    await drawer.waitFor();
    log(size, "phone day pick due:", await drawer.getByLabel("마감일").inputValue());
    await page.screenshot({ path: `${outDir}/after-month-picked-${size}.png` });
    await page.keyboard.press("Escape");
  }

  await go(page, `/events/${EVENT}/tasks/${SEEDED}`);
  await page.getByText("출력", { exact: true }).first().waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/${phase}-detail-${size}.png`, fullPage: true });

  if (phase === "after") {
    const title = page.getByRole("textbox", { name: "업무 제목" });
    await title.fill("안내문 출력·배포");
    await title.press("Enter");
    await page.waitForTimeout(400);
    await go(page, `/events/${EVENT}/tasks`);
    log(size, "title saved (list row after leaving):", await page.getByRole("button", { name: /안내문 출력·배포/ }).waitFor({ timeout: 5000 }).then(() => true, () => false));
    await go(page, `/events/${EVENT}/tasks/${SEEDED}`);
    await title.waitFor();
    await page.getByLabel("마감일").fill("2027-01-20");
    await page.getByLabel("마감일").blur();
    await page.waitForTimeout(400);
    log(size, "status after due:", await page.getByRole("status").allTextContents());
    await page.getByRole("checkbox", { name: "출력" }).click();
    await page.waitForTimeout(400);
    const complete = page.getByRole("button", { name: "업무 완료" });
    log(size, "complete enabled:", await complete.isEnabled());
    await page.screenshot({ path: `${outDir}/after-detail-ready-${size}.png`, fullPage: true });
    await complete.click();
    await page.getByRole("button", { name: "다시 진행" }).waitFor();
    log(size, "done → 다시 진행 shown, 업무 완료 hidden:", (await complete.count()) === 0);
    await page.screenshot({ path: `${outDir}/after-detail-done-${size}.png`, fullPage: true });
    await page.getByRole("button", { name: "다시 진행" }).click();
    await page.getByRole("button", { name: "업무 완료" }).waitFor();
    await page.getByRole("button", { name: "업무 삭제" }).click();
    await page.getByRole("dialog", { name: "업무를 삭제할까요?" }).waitFor();
    await page.screenshot({ path: `${outDir}/after-detail-delete-${size}.png` });
    await page.keyboard.press("Escape");
  }
  await ctx.close();
}
await browser.close();
