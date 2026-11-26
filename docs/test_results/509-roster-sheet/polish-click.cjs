// 참가 현황 스프레드시트 (#509) — 남은 겹침 정리 뒤 캡처 (2026-11-26).
// 로컬 서버(local 프로필, PostgreSQL 17: main으로 V29까지 → 이 브랜치로 V30) + Vite(VITE_API_MOCK=0).
// 같은 준비(10명, 방, 대리 수정 1명) + 1명 도착 체크인 → 뺀 버튼이 없는지, 답 칸을 고쳐도 같은 행인지,
// 열 메뉴의 정렬·필터·숨기기와 되돌리기, 상태 말(도착·미도착·도착 예정), 휴대폰에서 이름으로 상세.
// Usage: node polish-click.cjs <outDir>
const { chromium } = require("playwright");
const fs = require("fs");
const OUT = process.argv[2];
const APP = "http://localhost:5173";
const OWNER = "00000000-0000-4000-8000-000000000001";
const PIN = "730914";
const H = { "X-XSRF-TOKEN": "dev-csrf" };
const log = [];
const t0 = Date.now();
const mark = (step, extra = "") => {
  const line = `${((Date.now() - t0) / 1000).toFixed(1)}s ${step}${extra ? " — " + extra : ""}`;
  log.push(line);
  console.log(line);
};
const expect = (ok, what) => {
  if (!ok) throw new Error("확인 실패: " + what);
  mark("  ✓ " + what);
};
const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: "ko-KR", timezoneId: "Asia/Seoul" };
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ko-KR", timezoneId: "Asia/Seoul" };
async function api(ctx, method, path, data) {
  const res = await ctx.request.fetch(`${APP}${path}`, { method, headers: H, data });
  const text = await res.text();
  if (res.status() >= 300) throw new Error(`${method} ${path} ${res.status()} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = async (options) => {
    const c = await browser.newContext(options);
    await c.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
    return c;
  };
  const op = await ctx(desktop);
  await api(op, "POST", "/api/v1/operator/auth/login", { userId: OWNER });
  const spaces = await api(op, "GET", "/api/v1/operator/spaces");
  const spaceId = (spaces.items ?? spaces)[0].spaceId;
  const { eventId } = await api(op, "POST", `/api/v1/operator/spaces/${spaceId}/events`, {
    name: "겨울 수련회 (시트 병합 확인)", eventType: "RETREAT", startDate: "2027-01-22", endDate: "2027-01-24", place: "양평 수양관",
  });
  const ev = `/api/v1/operator/events/${eventId}`;
  const { formId } = await api(op, "POST", `${ev}/forms`, {});
  const sched = [
    { breakfast: false, lunch: false, dinner: true, worship: true },
    { breakfast: true, lunch: true, dinner: true, worship: true },
    { breakfast: true, lunch: false, dinner: false, worship: false },
  ];
  await api(op, "PUT", `${ev}/forms/${formId}/setup`, {
    gender: true, middleGroup: false, cell: false,
    attendance: { partial: true, worshipOnly: true, mode: "RANGE", noLodging: true },
    schedule: sched,
    transport: { groupBus: false, worshipShuttle: false, car: false, publicTransit: false, support: false },
  });
  const detail = await api(op, "GET", ev);
  await api(op, "POST", `${ev}/activate`, { expectedLifecycleVersion: detail.lifecycleVersion });
  await api(op, "PATCH", `${ev}/forms/${formId}`, { acceptingApplications: true });
  const ids = {};
  for (const f of (await api(op, "GET", `${ev}/forms/${formId}`)).fields) {
    const k = f.presetKey ?? f.systemKey;
    if (k) ids[k] = f.fieldId;
  }
  mark("행사·신청서", eventId);

  const names = ["김가람", "이나래", "박다솜", "최하늘", "정서준", "강민지", "조지우", "윤예린", "장도윤"];
  const people = {};
  for (const [i, name] of names.entries()) {
    const c = await ctx(phone);
    const answers = [
      { fieldId: ids.NAME, text: name },
      { fieldId: ids.PHONE, text: `010-5090-${String(i + 1).padStart(4, "0")}` },
      { fieldId: ids.COHORT, text: String(95 + (i % 5)) },
      { fieldId: ids.GENDER, value: { optionId: i % 2 === 0 ? "opt_male" : "opt_female" } },
      { fieldId: ids.ATTENDANCE, value: { optionId: "opt_full" } },
    ];
    if (ids.CONSENT) answers.push({ fieldId: ids.CONSENT, value: { value: true } });
    people[name] = await api(c, "POST", `/api/v1/public/events/${eventId}/forms/${formId}/applications`, { pin: PIN, answers });
    await c.close();
  }
  const added = await api(op, "POST", `${ev}/applications`, {
    formId,
    answers: [
      { fieldId: ids.NAME, text: "임현장" },
      { fieldId: ids.PHONE, text: "010-5090-0010" },
      { fieldId: ids.COHORT, text: "99" },
      { fieldId: ids.GENDER, value: { optionId: "opt_male" } },
      { fieldId: ids.ATTENDANCE, value: { optionId: "opt_worship" } },
    ],
  });
  people["임현장"] = added;
  mark("참가자 10명", "신청 9 + 직접 추가 1(임현장)");

  // 방 배정·공개 (G5 방 열)
  const r301 = (await api(op, "POST", `${ev}/rooms`, { name: "301호" })).room.roomId;
  const r401 = (await api(op, "POST", `${ev}/rooms`, { name: "401호" })).room.roomId;
  const changes = names.map((n, i) => ({ participantId: people[n].participantId, fromRoomId: null, toRoomId: i % 2 === 0 ? r301 : r401 }));
  await api(op, "POST", `${ev}/room-assignments`, { changes });
  const roomBoard = await api(op, "GET", `${ev}/room-board`);
  await api(op, "POST", `${ev}/rooms/publish`, { expectedBoardVersion: roomBoard.boardVersion, confirmUnassigned: true, confirmWarnings: true }).catch(async (e) => {
    mark("방 공개 재시도", e.message.slice(0, 80));
    const b = await api(op, "GET", `${ev}/room-board`);
    await api(op, "POST", `${ev}/rooms/publish`, { expectedBoardVersion: b.boardVersion, confirmUnassigned: true, confirmWarnings: true, confirmNotLodging: true });
  });
  mark("방 공개", "301호(남 5)·401호(여 4)");

  // 운영자 대리 수정 1명(A12) → "수정됨"
  let table = await api(op, "GET", `${ev}/applications/table`);
  const rowOf = (t, n) => t.rows.find((r) => r.participantId === people[n].participantId);
  const naraeRow = rowOf(table, "이나래");
  const naraeItems = table.columns
    .map((col) => {
      const value = naraeRow.answers[col.fieldId];
      if (!value) return null;
      if (col.fieldId === ids.COHORT) return { fieldId: col.fieldId, text: "00" };
      return typeof value.text === "string" ? { fieldId: col.fieldId, text: value.text } : { fieldId: col.fieldId, value };
    })
    .filter(Boolean);
  await api(op, "PUT", `${ev}/applications/${naraeRow.applicationId}/answers`, { expectedRevision: naraeRow.revision, answers: naraeItems });
  mark("운영자 대리 수정", "이나래 또래 96 → 00 (상세 경로와 같은 PUT …/answers)");
  table = await api(op, "GET", `${ev}/applications/table`);
  expect(table.rows.length === 10, `표 10행`);
  expect(table.rows.filter((r) => r.room).length >= 9, `방 열 값 ${table.rows.filter((r) => r.room).length}명`);

  // 1명 도착 체크인(현장 운영과 같은 말 확인용)
  const checkIn = await op.request.fetch(`${APP}${ev}/check-ins`, {
    method: "POST",
    headers: { ...H, "Idempotency-Key": crypto.randomUUID() },
    data: { mode: "MANUAL", participantId: people["김가람"].participantId },
  });
  if (checkIn.status() >= 300) throw new Error(`check-in ${checkIn.status()} ${await checkIn.text()}`);
  mark("체크인", "김가람 도착");

  const page = await op.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${APP}/events/${eventId}/participants`);
  const grid = page.getByRole("grid", { name: "신청자 명단" });
  await grid.waitFor();
  await page.getByText("수정됨").first().waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/p1-sheet-1440.png` });
  expect((await page.getByLabel("더할 행 수").count()) === 0, "시트 아래 행 추가 없음");
  expect((await grid.locator("button.roster__sort[title]").count()) === 0, "머리글 툴팁 없음");

  await grid.getByRole("button", { name: "현재 상태 열 메뉴" }).click();
  let menu = page.getByRole("menu", { name: "칸 메뉴" });
  const colItems = await menu.getByRole("menuitem").allInnerTexts();
  mark("열 메뉴", colItems.join(" | "));
  await page.screenshot({ path: `${OUT}/p2-column-menu-1440.png` });
  await page.keyboard.press("Escape");
  await page.mouse.click(5, 5);

  await grid.locator('td[data-r="1"][data-c="2"]').click({ button: "right" });
  menu = page.getByRole("menu", { name: "칸 메뉴" });
  const cellItems = (await menu.innerText()).split("\n").map((t) => t.trim()).filter(Boolean);
  mark("칸 메뉴(참가자 행)", cellItems.join(" | "));
  await page.screenshot({ path: `${OUT}/p3-cell-menu-1440.png` });
  await page.keyboard.press("Escape");
  await page.mouse.click(5, 5);

  // 운영 줄의 칸 메뉴
  await page.getByRole("button", { name: "+ 행", exact: true }).click();
  await grid.locator(".sheet-row--operator").first().waitFor();
  await grid.locator(".sheet-row--operator td").first().click({ button: "right" });
  menu = page.getByRole("menu", { name: "칸 메뉴" });
  mark("칸 메뉴(운영 줄)", (await menu.innerText()).split("\n").map((t) => t.trim()).filter(Boolean).join(" | "));
  await page.keyboard.press("Escape");

  const mob = await ctx(phone);
  await api(mob, "POST", "/api/v1/operator/auth/login", { userId: OWNER });
  const mp = await mob.newPage();
  mp.on("pageerror", (e) => errors.push(e.message));
  await mp.goto(`${APP}/events/${eventId}/participants`);
  await mp.getByRole("grid", { name: "신청자 명단" }).waitFor();
  await mp.waitForTimeout(800);
  await mp.getByRole("grid", { name: "신청자 명단" }).scrollIntoViewIfNeeded();
  await mp.screenshot({ path: `${OUT}/p4-sheet-390.png` });
  const ms = await mp.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  mark("390 가로", `scrollWidth ${ms[0]} / ${ms[1]}`);

  mark("콘솔 오류", errors.length ? errors.join(" | ").slice(0, 400) : "없음");
  fs.writeFileSync(`${OUT}/polish-click-log.txt`, log.join("\n") + "\n");
  await browser.close();
})().catch((error) => {
  console.error(error);
  fs.writeFileSync(`${OUT}/polish-click-log.txt`, log.join("\n") + "\nFAILED: " + error.message + "\n");
  process.exit(1);
});
