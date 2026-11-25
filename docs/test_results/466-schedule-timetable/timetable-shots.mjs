// Screenshots for #466 (일정표 as a timetable) against Vite with VITE_API_MOCK=1. The mock stores live in
// the page, so the event, items and a participant are seeded through `window.sceneMock` and the app is
// moved with in-app navigation. The clock is pinned with page.clock to 16:20 on day 1 in Seoul
// (2027-01-22T07:20:00Z), inside the event, so the current-time line and 지금·다음 show.
// Usage: [SIZES=phone,desktop,wide] node timetable-shots.mjs <appUrl> <outDir> <prefix> [timezoneId]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const [APP, outDir, prefix, timezoneId = "Asia/Seoul"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const EVENT = "00000000-0000-4000-8000-000000000020";
const OWNER = "00000000-0000-4000-8000-000000000001";
const NOW = new Date("2027-01-22T07:20:00Z");

const browser = await chromium.launch();
const sizes = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 },
  wide: { viewport: { width: 2000, height: 1100 }, deviceScaleFactor: 1 },
};
const only = (process.env.SIZES ?? "phone,desktop").split(",");

async function open(size) {
  const ctx = await browser.newContext({ ...sizes[size], locale: "ko-KR", timezoneId });
  await ctx.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  await page.goto(`${APP}/`);
  await page.waitForFunction(() => window.sceneMock?.schedule);
  await page.evaluate(
    async ({ EVENT, OWNER }) => {
      const { schedule, operator, forms, participants } = window.sceneMock;
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
      // One change saved but not published, to show the pending mark.
      add({ day: 1, startTime: "17:30", endTime: "17:50", title: "단체 사진", place: "본관 앞", category: "PROGRAM" });
      // A participant (the mock signs in the last applicant).
      const form = forms.createForm(EVENT, OWNER, {});
      forms.setAccepting(EVENT, form.formId, OWNER, { acceptingApplications: true });
      const answers = form.fields.flatMap((field) =>
        field.systemKey === "NAME" ? [{ fieldId: field.fieldId, text: "김가람" }] : field.systemKey === "PHONE" ? [{ fieldId: field.fieldId, text: "010-2222-3300" }] : [],
      );
      participants.submitPublicApplication(EVENT, form.formId, { answers, pin: "730914" });
      await fetch("/api/v1/operator/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-XSRF-TOKEN": "dev-csrf" },
        body: JSON.stringify({ userId: OWNER }),
      });
    },
    { EVENT, OWNER },
  );
  return { ctx, page };
}

async function go(page, path) {
  await page.evaluate((to) => {
    window.history.pushState({}, "", to);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

for (const size of only) {
  const { ctx, page } = await open(size);
  await go(page, `/events/${EVENT}/schedule`);
  // The dev login panel (DevLoginPanel) signs in the seeded owner and returns to the schedule.
  const enter = page.getByRole("button", { name: "들어가기" });
  await Promise.race([page.getByRole("heading", { name: "일정표" }).waitFor(), enter.waitFor()]);
  if (await enter.count()) await enter.click();
  await page.getByRole("heading", { name: "일정표" }).waitFor({ timeout: 8000 });
  await page.getByText("저녁 집회").first().waitFor();
  await page.waitForTimeout(600);
  // What the operator sees on opening (scrolled to the current time), then the whole page.
  await page.screenshot({ path: `${outDir}/${prefix}-operator-${size}-viewport.png` });
  await page.screenshot({ path: `${outDir}/${prefix}-operator-${size}.png`, fullPage: true });
  const hasLine = await page.locator(".timetable__now").count();
  const current = await page.locator('[aria-current="time"]').allInnerTexts();
  console.log(`${prefix} operator ${size}: now line ${hasLine}, current ${JSON.stringify(current)}`);
  if (size === "desktop" && hasLine) {
    const day = page.getByRole("button", { name: "하루 보기" });
    if (await day.count()) {
      await day.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${outDir}/${prefix}-operator-desktop-day.png` });
    }
  }
  if (size === "phone") {
    await go(page, `/participate/${EVENT}/schedule`);
    await page.getByRole("heading", { name: "일정" }).waitFor();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${outDir}/${prefix}-participant-phone-viewport.png` });
    await page.screenshot({ path: `${outDir}/${prefix}-participant-phone.png`, fullPage: true });
    console.log(`${prefix} participant phone: now line ${await page.locator(".timetable__now").count()}, current ${JSON.stringify(await page.locator('[aria-current="time"]').allInnerTexts())}`);
  }
  await ctx.close();
}
await browser.close();
