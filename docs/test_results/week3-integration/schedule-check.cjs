// 일정 공개 뒤 참가자 일정 탭(main의 시간표)과 홈 카드(3주차 내 조·숙소)가 함께 보이는지. Usage: node schedule-check.cjs <eventId> <outDir>
const { chromium } = require("playwright");
const [eventId, OUT] = process.argv.slice(2);
const APP = "http://localhost:5173";
const H = { "X-XSRF-TOKEN": "dev-csrf" };
(async () => {
  const b = await chromium.launch();
  const mk = async (o) => { const c = await b.newContext(o); await c.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]); return c; };
  const call = async (c, m, p, d) => { const r = await c.request.fetch(APP + p, { method: m, headers: H, data: d }); const t = await r.text(); if (r.status() >= 300) throw new Error(`${m} ${p} ${r.status()} ${t}`); return t ? JSON.parse(t) : null; };
  const op = await mk({});
  await call(op, "POST", "/api/v1/operator/auth/login", { userId: "00000000-0000-4000-8000-000000000001" });
  const ev = `/api/v1/operator/events/${eventId}`;
  await call(op, "POST", `${ev}/schedule/items`, { day: 2, startTime: "19:30", title: "저녁 집회", category: "WORSHIP", audience: [{ type: "ALL" }] }).catch((e) => console.log("item", String(e).slice(0, 200)));
  const board = await call(op, "GET", `${ev}/schedule`);
  console.log("publish", (await call(op, "POST", `${ev}/schedule/publish`, { expectedBoardVersion: board.boardVersion, notify: false })).result);
  // 신청한 참가자 세션은 앞 스크립트의 브라우저에 있었으므로 새 참가자로 확인한다.
  const forms = await call(op, "GET", `${ev}/forms`).catch(() => null);
  const formId = (forms?.items ?? forms ?? [])[0]?.formId;
  const f = await call(op, "GET", `${ev}/forms/${formId}`);
  const ids = {}; for (const x of f.fields) { const k = x.presetKey ?? x.systemKey; if (k) ids[k] = x.fieldId; }
  const p = await mk({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  const a = [{ fieldId: ids.NAME, text: "일정확인" }, { fieldId: ids.PHONE, text: "010-4700-0099" }, { fieldId: ids.COHORT, text: "02" }, { fieldId: ids.GENDER, value: { optionId: "opt_male" } }, { fieldId: ids.ATTENDANCE, value: { optionId: "opt_full" } }];
  if (ids.CONSENT) a.push({ fieldId: ids.CONSENT, value: { value: true } });
  await call(p, "POST", `/api/v1/public/events/${eventId}/forms/${formId}/applications`, { pin: "730914", answers: a });
  const page = await p.newPage();
  await page.goto(`${APP}/participate/${eventId}`);
  await page.getByRole("region", { name: "숙소" }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  console.log("home:", (await page.locator("main").innerText()).replace(/\n+/g, " / ").slice(0, 400));
  await page.screenshot({ path: `${OUT}/34-participant-home-with-schedule-390.png`, fullPage: true });
  await page.goto(`${APP}/participate/${eventId}/schedule`);
  await page.getByText("저녁 집회").first().waitFor({ timeout: 30000 });
  console.log("schedule:", (await page.locator("main").innerText()).replace(/\n+/g, " / ").slice(0, 300));
  console.log("overflow:", await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth));
  await page.screenshot({ path: `${OUT}/35-participant-schedule-390.png`, fullPage: true });
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
