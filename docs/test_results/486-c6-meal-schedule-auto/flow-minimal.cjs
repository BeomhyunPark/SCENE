// #486 화면 최소화 뒤(2026-11-26) 다시 한 흐름: 로컬 서버(local, PostgreSQL 17, V1~V29) + Vite(VITE_API_MOCK=0).
// 설정 카드 저장 → 일정표(1440·390)에 식사·집회가 다른 일정과 똑같이 들어와 있음(새 글자·버튼 없음)
// → 저녁을 18:30으로 고침 → 식수 현황(390)의 다음 식사가 18:30.
// Usage: node flow-minimal.cjs <outDir>
const { chromium } = require("playwright");
const fs = require("fs");
const OUT = process.argv[2];
const APP = "http://localhost:5173";
const OWNER = "00000000-0000-4000-8000-000000000001";
const H = { "X-XSRF-TOKEN": "dev-csrf" };
const log = [];
const mark = (step, extra = "") => { const line = `${step}${extra ? " — " + extra : ""}`; log.push(line); console.log(line); };
const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: "ko-KR", timezoneId: "Asia/Seoul" };
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ko-KR", timezoneId: "Asia/Seoul" };
const CELLS = ["1일차 저녁", "1일차 집회", "2일차 아침", "2일차 점심", "2일차 저녁", "2일차 집회", "3일차 아침"];
const NEW_WORDS = /자동으로 들어왔어요|다시 넣기|일정표에 없는 식사|신청서 설정에서 빠진/;

(async () => {
  const browser = await chromium.launch();
  const ctx = async (o) => { const c = await browser.newContext(o); await c.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]); await c.request.fetch(`${APP}/api/v1/operator/auth/login`, { method: "POST", headers: H, data: { userId: OWNER } }); return c; };
  const op = await ctx(desktop);
  const api = async (method, path, data) => { const r = await op.request.fetch(`${APP}${path}`, { method, headers: H, data }); const t = await r.text(); if (r.status() >= 300) throw new Error(`${method} ${path} ${r.status()} ${t.slice(0, 300)}`); return t ? JSON.parse(t) : null; };
  const spaces = await api("GET", "/api/v1/operator/spaces");
  const spaceId = (spaces.items ?? spaces)[0].spaceId;
  const today = new Date(Date.now() + 9 * 3600e3);
  const day = (o) => new Date(today.getTime() + o * 86400e3).toISOString().slice(0, 10);
  const { eventId } = await api("POST", `/api/v1/operator/spaces/${spaceId}/events`, { name: "C6 식사 자동 연동 확인", eventType: "RETREAT", startDate: day(0), endDate: day(2), place: "양평 수양관" });
  const ev = `/api/v1/operator/events/${eventId}`;
  await api("POST", `${ev}/forms`, {});
  mark("행사 만들기", `${day(0)}~${day(2)}, 오늘이 1일차, 일정 ${(await api("GET", `${ev}/schedule`)).items.length}개`);

  const page = await op.newPage();
  await page.goto(`${APP}/events/${eventId}/participants/setup`);
  await page.getByRole("checkbox", { name: "1일차 저녁" }).waitFor({ timeout: 30000 });
  for (const name of CELLS) await page.getByRole("checkbox", { name }).check();
  await page.getByRole("button", { name: "질문 만들기" }).click();
  await page.waitForTimeout(2000);
  mark("설정 카드 저장(질문 만들기)", CELLS.join(", "));

  await page.goto(`${APP}/events/${eventId}/schedule`);
  await page.getByRole("link", { name: "18:00 저녁 고치기" }).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/08-schedule-1440.png`, fullPage: true });
  const text1440 = await page.locator("main").innerText();
  const board = await api("GET", `${ev}/schedule`);
  mark("일정표 1440", `항목 ${board.items.length}개: ` + board.items.map((i) => `${i.day}일차 ${i.startTime} ${i.title}`).join(", "));
  mark("일정표 1440 새 글자·버튼", NEW_WORDS.test(text1440) ? "있음(실패)" : "없음");

  const ph = await ctx(phone);
  const sp = await ph.newPage();
  await sp.goto(`${APP}/events/${eventId}/schedule?day=1`);
  await sp.getByRole("link", { name: "18:00 저녁 고치기" }).first().waitFor({ timeout: 30000 });
  await sp.waitForTimeout(800);
  await sp.screenshot({ path: `${OUT}/09-schedule-390.png`, fullPage: true });
  const text390 = await sp.locator("main").innerText();
  mark("일정표 390 새 글자·버튼", NEW_WORDS.test(text390) ? "있음(실패)" : "없음");
  mark("일정표 390 가로 넘침", String(await sp.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)));

  await page.goto(`${APP}/events/${eventId}/schedule?day=1`);
  await page.getByRole("link", { name: "18:00 저녁 고치기" }).first().click();
  const form = page.getByRole("form", { name: "일정 고치기" });
  await form.waitFor({ timeout: 30000 });
  await form.getByLabel("시작").fill("18:30");
  await form.getByRole("button", { name: "저장만" }).click();
  await page.getByRole("link", { name: "18:30 저녁 고치기" }).first().waitFor({ timeout: 30000 });
  mark("일정표에서 1일차 저녁 18:00 → 18:30 (저장만)");

  const meals = await ph.newPage();
  await meals.goto(`${APP}/events/${eventId}/meals`);
  await meals.getByText(/다음 식사 ·/).first().waitFor({ timeout: 30000 });
  await meals.waitForTimeout(800);
  const next = (await meals.getByText(/다음 식사 ·/).first().innerText()).trim();
  await meals.screenshot({ path: `${OUT}/10-meals-390-1830.png`, fullPage: true });
  mark("식수 현황 390", next);
  mark("식수 현황 390 가로 넘침", String(await meals.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)));
  mark("공개 전 공개본", (await api("GET", `${ev}/schedule/published`)).status);

  fs.writeFileSync(`${OUT}/click-log-minimal.txt`, log.join("\n") + "\n");
  await browser.close();
})().catch((e) => { console.error(e); fs.writeFileSync(`${OUT}/click-log-minimal.txt`, log.join("\n") + "\nFAILED: " + e + "\n"); process.exit(1); });
