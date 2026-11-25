// 박스 줄이기 전/후 캡처와 테두리 박스 수 (행사 홈·현장 운영·식수 현황). VITE_API_MOCK=1 pnpm dev 위에서 실행.
// node shots.mjs <outDir> <prefix>   예: node shots.mjs . before
// 상태: sparse = 참가자 1명·업무 0·공지 0, rich = 참가자 8명·업무 4·일정 4·공지 2·체크인 3. 수련회(2027-01-22~24) 둘째 날 09:30 기준.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const [outDir = ".", prefix = "shot"] = process.argv.slice(2);
const APP = "http://localhost:5173";
const EVENT = "00000000-0000-4000-8000-000000000251"; // summarySeed RETREAT
const OWNER = "00000000-0000-4000-8000-000000000001";
const browser = await chromium.launch();
const counts = [];

async function open(viewport, mobile, state) {
  const context = await browser.newContext({
    viewport, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile, locale: "ko-KR", timezoneId: "Asia/Seoul",
  });
  await context.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
  const page = await context.newPage();
  await page.goto(`${APP}/login`);
  await page.waitForFunction(() => window.sceneMock && navigator.serviceWorker?.controller != null, null, { timeout: 20000 });
  await page.evaluate(async ({ OWNER, state }) => {
    const m = window.sceneMock;
    const seed = await import("/src/test/summarySeed.ts");
    const checks = await import("/src/mocks/checkInStore.ts");
    const notices = await import("/src/mocks/noticeStore.ts");
    const meals = await import("/src/mocks/mealCounts.ts");
    const EVENT = seed.RETREAT;
    // 2일차 09:30: 1일차 저녁에 왔어야 할 사람이 "왔어야 함", 다음 끼니는 2일차 점심.
    meals.setMealCountsNow(new Date("2027-01-23T09:30:00+09:00"));
    const retreat = seed.seedRetreat();
    const full = { ATTENDANCE: { optionId: "opt_full" } };
    const people = state === "sparse"
      ? [["94", "김하늘", "opt_female", full]]
      : [["94", "김하늘", "opt_female", full], ["95", "이수아", "opt_female", full], ["95", "박서준", "opt_male", full],
         ["96", "최예린", "opt_female", full], ["96", "정도윤", "opt_male", full], ["97", "한지우", "opt_male", full],
         ["97", "오세린", "opt_female", { ATTENDANCE: { optionId: "opt_partial" }, MEALS: { optionIds: ["opt_d2_lunch", "opt_d2_dinner"] } }],
         ["98", "윤도현", "opt_male", full]];
    const apps = people.map(([COHORT, NAME, g, extra]) => retreat.apply({ NAME, COHORT, GENDER: { optionId: g }, ...extra }));
    if (state === "rich") {
      const rows = m.participants.tableApplications(EVENT);
      const pid = (app) => rows.find((r) => r.applicationId === app).participantId;
      checks.seedCheckIn(EVENT, pid(apps[0]));
      checks.seedCheckIn(EVENT, pid(apps[1]), "2027-01-22T09:50:00Z");
      checks.seedCheckIn(EVENT, pid(apps[3]), "2027-01-22T10:05:00Z");
      const one = { groupId: "00000000-0000-4000-8000-00000000a001", name: "1조" };
      const two = { groupId: "00000000-0000-4000-8000-00000000a002", name: "2조" };
      apps.forEach((app, i) => m.groups.seedAssignment(EVENT, pid(app), { ...(i % 2 ? two : one), leader: i < 2 }));
      const board = m.groups.readBoard(EVENT, OWNER);
      m.groups.publish(EVENT, OWNER, { expectedBoardVersion: board.boardVersion, confirmUnassigned: true });
      m.tasks.createTask(EVENT, OWNER, { title: "숙소 배정 확인" });
      m.tasks.createTask(EVENT, OWNER, { title: "준비물 최종 수량 확정", assigneeUserId: OWNER });
      m.tasks.createTask(EVENT, OWNER, { title: "장소 계약서 업로드" });
      m.tasks.createTask(EVENT, OWNER, { title: "차량 배차표 공유" });
      [["18:00", "저녁 식사", "식당", "MEAL", 1], ["19:30", "개회 예배", "대강당", "WORSHIP", 1], ["08:00", "아침 식사", "식당", "MEAL", 2], ["13:00", "공동체 활동", "운동장", "PROGRAM", 2]].forEach(
        ([startTime, title, place, category, day]) => m.schedule.seedScheduleItem(EVENT, { day, startTime, title, place, category }),
      );
      notices.createOperatorNotice(EVENT, OWNER, { title: "조장 모임은 2시에 식당 앞에서 해요", body: "조장 모임", audience: [{ type: "STAFF" }], publish: true, important: true });
      notices.createOperatorNotice(EVENT, OWNER, { title: "차량 배차표를 올렸어요", body: "배차표", audience: [{ type: "STAFF" }], publish: true });
    }
    const res = await fetch("/api/v1/operator/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json", "X-XSRF-TOKEN": "dev-csrf" },
      body: JSON.stringify({ userId: OWNER }), credentials: "include",
    });
    if (!res.ok) throw new Error(`login ${res.status}`);
  }, { OWNER, state });
  return { context, page };
}

async function go(page, href, ready) {
  await page.evaluate((href) => { history.pushState({}, "", href); dispatchEvent(new PopStateEvent("popstate")); }, href);
  await ready();
  await page.waitForTimeout(1200);
}

/** Elements inside the screen body with a visible border on all four sides. Controls are counted apart. */
async function boxes(page) {
  return page.evaluate(() => {
    const root = document.querySelector(".event-home, .event-field");
    let containers = 0, controls = 0;
    const names = [];
    for (const el of root.querySelectorAll("*")) {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || s.visibility === "hidden") continue;
      if (r.width < 16 && r.height < 16) continue; // icon glyphs (the empty status circle) are not boxes
      const sides = ["Top", "Right", "Bottom", "Left"].every((side) => parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== "none" && !/rgba\(0, 0, 0, 0\)/.test(s[`border${side}Color`]));
      if (!sides) continue;
      if (el.matches("button, input, textarea, select, a.scene-button")) controls += 1;
      else { containers += 1; names.push(el.className || el.tagName); }
    }
    return { containers, controls, names };
  });
}

const screens = [
  ["home", `/events/${EVENT}`, (p) => p.getByRole("button", { name: "행사 설정" }).waitFor()],
  ["field", `/events/${EVENT}/field`, (p) => p.getByRole("region", { name: "체크인 현황" }).getByText("전체").waitFor()],
  ["meals", `/events/${EVENT}/meals`, (p) => p.getByRole("button", { name: "새로 고침" }).waitFor()],
];

for (const state of ["sparse", "rich"]) {
  for (const [label, viewport, mobile] of [["1440", { width: 1440, height: 900 }, false], ["390", { width: 390, height: 844 }, true]]) {
    const { context, page } = await open(viewport, mobile, state);
    for (const [name, href, ready] of screens) {
      await go(page, href, () => ready(page));
      const file = `${prefix}-${name}-${state}-${label}.png`;
      await page.screenshot({ path: `${outDir}/${file}`, fullPage: true });
      const b = await boxes(page);
      counts.push({ screen: name, state, width: label, containers: b.containers, controls: b.controls, names: b.names });
      console.log(file, b.containers, b.controls);
      if (name === "field" && state === "rich") {
        // 조별 명단 with the first group open (#288).
        await page.getByRole("button", { name: "조별 명단" }).click();
        await page.getByRole("list", { name: "조별 체크인 현황" }).getByRole("button", { expanded: false }).first().click();
        await page.waitForTimeout(800);
        await page.screenshot({ path: `${outDir}/${prefix}-field-groups-${label}.png`, fullPage: true });
        await page.getByRole("button", { name: "전체 명단" }).click();
      }
    }
    await context.close();
  }
}
writeFileSync(`${outDir}/${prefix}-boxes.json`, JSON.stringify(counts, null, 2));
await browser.close();
