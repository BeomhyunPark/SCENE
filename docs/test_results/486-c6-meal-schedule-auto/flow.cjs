// #486 (C6, DEC-090) 실제 클릭: 로컬 서버(local 프로필, PostgreSQL 17, V1~V29) + Vite(VITE_API_MOCK=0).
// 신청서 설정 카드 저장 → 일정표에 식사·집회가 들어와 있음 → 저녁 시각을 고침(저장만) → 식수 현황의 다음 식사 시각이 따라옴
// → 공개 전에는 참가자 공개본 없음 → 점심을 지우고 설정을 다시 저장해도 안 돌아옴 → "식사·집회 다시 넣기".
// Usage: node flow.cjs <outDir>
const { chromium } = require("playwright");
const fs = require("fs");
const OUT = process.argv[2];
const APP = "http://localhost:5173";
const OWNER = "00000000-0000-4000-8000-000000000001";
const H = { "X-XSRF-TOKEN": "dev-csrf" };
const log = [];
const mark = (step, extra = "") => {
  const line = `${step}${extra ? " — " + extra : ""}`;
  log.push(line);
  console.log(line);
};
const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: "ko-KR", timezoneId: "Asia/Seoul" };
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ko-KR", timezoneId: "Asia/Seoul" };
const CELLS = ["1일차 저녁", "1일차 집회", "2일차 아침", "2일차 점심", "2일차 저녁", "2일차 집회", "3일차 아침"];

(async () => {
  const browser = await chromium.launch();
  const ctx = async (options) => {
    const c = await browser.newContext(options);
    await c.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
    return c;
  };
  const op = await ctx(desktop);
  const api = async (method, path, data) => {
    const res = await op.request.fetch(`${APP}${path}`, { method, headers: H, data });
    const text = await res.text();
    if (res.status() >= 300) throw new Error(`${method} ${path} ${res.status()} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  };
  await api("POST", "/api/v1/operator/auth/login", { userId: OWNER });
  const spaces = await api("GET", "/api/v1/operator/spaces");
  const spaceId = (spaces.items ?? spaces)[0].spaceId;
  const today = new Date(Date.now() + 9 * 3600e3);
  const day = (offset) => new Date(today.getTime() + offset * 86400e3).toISOString().slice(0, 10);
  const { eventId } = await api("POST", `/api/v1/operator/spaces/${spaceId}/events`, { name: "C6 식사 자동 연동 확인", eventType: "RETREAT", startDate: day(0), endDate: day(2), place: "양평 수양관" });
  const ev = `/api/v1/operator/events/${eventId}`;
  await api("POST", `${ev}/forms`, {});
  mark("행사 만들기", `${day(0)}~${day(2)}, 오늘이 1일차`);
  const before = await api("GET", `${ev}/schedule`);
  mark("설정 저장 전 일정표", `항목 ${before.items.length}개`);

  // 1. 신청서 설정 카드: 식사·집회 칸 고르고 "질문 만들기"
  const page = await op.newPage();
  async function saveSetup(check) {
    await page.goto(`${APP}/events/${eventId}/participants/setup`);
    await page.getByRole("checkbox", { name: "1일차 저녁" }).waitFor({ timeout: 30000 });
    if (check) {
      for (const name of CELLS) await page.getByRole("checkbox", { name }).check();
      await page.getByRole("button", { name: "질문 만들기" }).click();
    } else {
      // Saved once: "설정 저장" opens after a change, so turn one cell off and back on.
      await page.getByRole("checkbox", { name: "3일차 아침" }).uncheck();
      await page.getByRole("checkbox", { name: "3일차 아침" }).check();
      await page.getByRole("button", { name: "설정 저장" }).click();
    }
    await page.waitForTimeout(2000);
  }
  await saveSetup(true);
  await page.screenshot({ path: `${OUT}/01-setup-card-saved.png`, fullPage: false });
  mark("설정 카드 저장", CELLS.join(", "));

  // 2. 일정표: 식사·집회가 들어와 있다
  await page.goto(`${APP}/events/${eventId}/schedule`);
  await page.getByText(/식사·집회 \d+개가 신청서 설정에서 자동으로 들어왔어요/).waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);
  const note = await page.locator(".event-schedule__slots").innerText();
  await page.screenshot({ path: `${OUT}/02-schedule-auto-filled.png`, fullPage: true });
  const board = await api("GET", `${ev}/schedule`);
  mark("일정표 안내", note.replace(/\n+/g, " / "));
  mark("일정표 작업본", board.items.map((i) => `${i.day}일차 ${i.startTime} ${i.title} (${i.category}, ${i.slotId}, auto=${i.autoFilled}, ${i.publishState})`).join(" | "));

  // 3. 식수 현황(휴대폰): 다음 식사 시각
  const ph = await ctx(phone);
  await ph.request.fetch(`${APP}/api/v1/operator/auth/login`, { method: "POST", headers: H, data: { userId: OWNER } });
  const meals = await ph.newPage();
  await meals.goto(`${APP}/events/${eventId}/meals`);
  await meals.getByText(/다음 끼니 ·|다음 식사 ·/).first().waitFor({ timeout: 30000 });
  const nextBefore = (await meals.getByText(/다음 끼니 ·|다음 식사 ·/).first().innerText()).trim();
  await meals.screenshot({ path: `${OUT}/03-meals-before-1800.png`, fullPage: false });
  mark("식수 현황 (고치기 전)", nextBefore);

  // 4. 일정표에서 1일차 저녁을 18:30으로 고침(저장만)
  await page.goto(`${APP}/events/${eventId}/schedule?day=1`);
  await page.getByRole("link", { name: "18:00 저녁 고치기" }).first().click();
  const form = page.getByRole("form", { name: "일정 고치기" });
  await form.waitFor({ timeout: 30000 });
  await form.getByLabel("시작").fill("18:30");
  await form.getByRole("button", { name: "저장만" }).click();
  await page.getByRole("link", { name: "18:30 저녁 고치기" }).first().waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${OUT}/04-schedule-dinner-1830.png`, fullPage: true });
  mark("일정표 저녁 고침", "18:00 → 18:30 (저장만)");

  // 5. 식수 현황이 따라온다
  await meals.reload();
  await meals.getByText(/18:30/).first().waitFor({ timeout: 30000 });
  const nextAfter = (await meals.getByText(/다음 끼니 ·|다음 식사 ·/).first().innerText()).trim();
  await meals.screenshot({ path: `${OUT}/05-meals-after-1830.png`, fullPage: false });
  const counts = await api("GET", `${ev}/meal-counts`);
  const dinner = counts.days[0].slots.find((s) => s.slotId === "opt_d1_dinner");
  mark("식수 현황 (고친 뒤)", `${nextAfter} · API startTime=${dinner.startTime} timeFromSchedule=${dinner.timeFromSchedule} passed=${dinner.passed}`);

  // 6. 공개 전: 공개본 없음
  const published = await api("GET", `${ev}/schedule/published`);
  mark("공개 전 공개본", published.status);

  // 7. 점심을 지우고 설정을 다시 저장 → 안 돌아옴 → 다시 넣기
  const lunch = (await api("GET", `${ev}/schedule`)).items.find((i) => i.slotId === "opt_d2_lunch");
  await api("DELETE", `${ev}/schedule/items/${lunch.itemId}?expectedVersion=${lunch.version}`);
  await saveSetup(false);
  const afterSave = await api("GET", `${ev}/schedule`);
  mark("점심 지우고 설정 다시 저장", `점심 항목 ${afterSave.items.some((i) => i.slotId === "opt_d2_lunch") ? "있음(실패)" : "없음"}, 저녁 ${afterSave.items.find((i) => i.slotId === "opt_d1_dinner").startTime}`);
  await page.goto(`${APP}/events/${eventId}/schedule?day=2`);
  await page.getByRole("button", { name: "식사·집회 다시 넣기" }).waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${OUT}/06-schedule-missing-lunch.png`, fullPage: true });
  await page.getByRole("button", { name: "식사·집회 다시 넣기" }).click();
  await page.getByText(/식사·집회 1개를 다시 넣었어요/).waitFor({ timeout: 30000 });
  await page.getByRole("link", { name: "12:00 점심 고치기" }).first().waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${OUT}/07-schedule-refilled.png`, fullPage: true });
  mark("다시 넣기", "식사·집회 1개를 다시 넣었어요 · 2일차 12:00 점심");

  // 8. 가로 넘침
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  const overflowPhone = await meals.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  mark("가로 넘침", `일정표 1440px ${overflow}, 식수 현황 390px ${overflowPhone}`);

  fs.writeFileSync(`${OUT}/click-log.txt`, log.join("\n") + "\n");
  await browser.close();
})().catch((e) => {
  console.error(e);
  fs.writeFileSync(`${OUT}/click-log.txt`, log.join("\n") + "\nFAILED: " + e + "\n");
  process.exit(1);
});
