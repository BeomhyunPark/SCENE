// Event home screenshots (#467) against Vite with VITE_API_MOCK=1. The mock stores live in the page,
// so the script logs in with the dev panel, seeds through window.sceneMock and moves by in-app links.
// Usage: node event-home-shots.mjs <outDir> <prefix>
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const [outDir, prefix = "after"] = process.argv.slice(2);
const APP = "http://localhost:5173";
const EVENT = "00000000-0000-4000-8000-000000000020";
const OWNER = "00000000-0000-4000-8000-000000000001";

const browser = await chromium.launch();
const sizes = {
  desktop: { viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, locale: "ko-KR", timezoneId: "Asia/Seoul" },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ko-KR", timezoneId: "Asia/Seoul" },
};

async function seeded(options, status) {
  const ctx = await browser.newContext(options);
  const page = await ctx.newPage();
  await page.goto(`${APP}/login`);
  await page.waitForFunction(() => window.sceneMock);
  await page.evaluate(({ EVENT, OWNER, status }) => {
    const m = window.sceneMock;
    const day = (offset) => {
      const d = new Date(Date.now() + offset * 86400000);
      return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d);
    };
    if (status !== "EMPTY") {
      m.schedule.setSchedulePeriod(EVENT, day(0), day(2));
      const form = m.forms.createForm(EVENT, OWNER, {});
      const fields = Object.fromEntries(form.fields.map((f) => [f.systemKey, f.fieldId]));
      const people = ["김가람", "이나래", "박서연", "정하늘", "최민준", "한지우", "오세린", "윤도현"];
      const apps = people.map((name, i) =>
        m.participants.seedApplication(EVENT, form.formId, new Date().toISOString(), [
          { fieldId: fields.NAME, value: { text: name } },
          { fieldId: fields.PHONE, value: { text: `010-4242-00${10 + i}` } },
        ]),
      );
      m.participants.reviseApplication(EVENT, apps[1].applicationId, { [fields.COHORT]: { text: "95" } });
      m.participants.reviseApplication(EVENT, apps[4].applicationId, { [fields.COHORT]: { text: "97" } });
      const t1 = m.tasks.createTask(EVENT, OWNER, { title: "숙소 배정 확인" });
      const t2 = m.tasks.createTask(EVENT, OWNER, { title: "준비물 최종 수량 확정", assigneeUserId: OWNER });
      m.tasks.createTask(EVENT, OWNER, { title: "장소 계약서 업로드" });
      m.tasks.createTask(EVENT, OWNER, { title: "차량 배차표 공유" });
      void t1; void t2;
      [["08:00", "아침 식사", "식당", "MEAL"], ["09:30", "말씀과 묵상", "대강당", "WORSHIP"], ["13:00", "공동체 활동", "운동장", "PROGRAM"], ["18:00", "저녁 식사", "식당", "MEAL"]].forEach(
        ([startTime, title, place, category], i) => m.schedule.seedScheduleItem(EVENT, { day: i < 2 ? 2 : 3, startTime, title, place, category }),
      );
      m.operator.setLifecycle(EVENT, status, 3);
    }
  }, { EVENT, OWNER, status });
  await page.getByRole("button", { name: /로그인|들어가기/ }).first().click();
  await page.waitForURL(/\/events/);
  await page.evaluate((href) => { history.pushState({}, "", href); dispatchEvent(new PopStateEvent("popstate")); }, `/events/${EVENT}`);
  await page.getByRole("button", { name: "행사 설정" }).waitFor();
  await page.waitForTimeout(1200);
  return { ctx, page };
}

for (const status of ["ACTIVE", "EMPTY"]) {
  for (const [name, options] of Object.entries(sizes)) {
    const { ctx, page } = await seeded(options, status);
    const file = `${outDir}/${prefix}-${status === "EMPTY" ? "draft-empty" : "active"}-${name === "desktop" ? 1440 : 390}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(file);
    await ctx.close();
  }
}
await browser.close();
