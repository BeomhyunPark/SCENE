// 참가 현황 스프레드시트 (#509) — main 병합 뒤 실제 API 클릭 (2026-11-26).
// 로컬 서버(local 프로필, PostgreSQL 17: main으로 V29까지 → 이 브랜치로 V30) + Vite(VITE_API_MOCK=0).
// 신청 9명 + 직접 추가 1명, 방 배정·공개, 운영자 대리 수정 1명("수정됨") → 1440·390 캡처
// → 시트에서 한 사람의 성별 칸을 고쳐 저장 → 표 revision·신청 상세·신청 집계가 같은 값인지 확인.
// Usage: node merge-click.cjs <outDir>
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

  // 1440 캡처
  const page = await op.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${APP}/events/${eventId}/participants`);
  const grid = page.getByRole("grid", { name: "신청자 명단" });
  await grid.waitFor();
  await page.getByText("수정됨").first().waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/m1-merged-1440.png` });
  const bodyText = await page.locator("main").innerText();
  expect(bodyText.includes("직접 추가") && bodyText.includes("301호"), "1440: '수정됨'·'직접 추가'·방 301호가 보임");
  const scroll = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  mark("1440 가로", `scrollWidth ${scroll[0]} / ${scroll[1]}`);

  // 성별 칸 고치기: 최하늘(여성 → 남성)
  // 성별은 기본으로 숨긴 열이다: "+ 열 보기"에서 켠다.
  await page.getByRole("button", { name: "+ 열 보기" }).click();
  const colPanel = page.getByRole("group", { name: "열 보기" });
  await colPanel.getByRole("checkbox", { name: "성별" }).click();
  await page.screenshot({ path: `${OUT}/m1b-column-panel-1440.png` });
  await page.getByRole("button", { name: "+ 열 보기" }).click().catch(() => {});
  // 열은 가로로 넘기면 그려진다: 성별 머리글이 나올 때까지 오른쪽으로.
  const gender =grid.locator("thead th", { has: page.locator(".roster__label", { hasText: /^성별$/ }) });
  for (let i = 0; i < 20 && (await gender.count()) === 0; i++) {
    await grid.evaluate((el) => (el.parentElement.scrollLeft += 500));
    await page.waitForTimeout(150);
  }
  const labels = await grid.locator("thead th .roster__label").allTextContents();
  const genderCol = (await gender.count()) ? Number(await gender.first().getAttribute("aria-colindex")) - 2 : -1;
  expect(genderCol >= 0, `성별 열 ${genderCol} (머리글 ${labels.join("|")})`);
  const before = await api(op, "GET", `${ev}/applications/summary`);
  const haneulIndex = await grid.locator("tbody tr").evaluateAll((rows) => rows.findIndex((r) => r.textContent.includes("최하늘")));
  const haneulRow = grid.locator("tbody tr").nth(haneulIndex);
  const cell = haneulRow.locator(`[data-c="${genderCol}"]`);
  const r = await cell.getAttribute("data-r");
  mark("고칠 칸", `최하늘 행 data-r=${r}, 지금 값 "${(await cell.innerText()).trim()}"`);
  await cell.click();
  await page.keyboard.press("Enter");
  const editor = grid.getByRole("textbox");
  await editor.fill("남성");
  await page.screenshot({ path: `${OUT}/m2-editing-1440.png` });
  await page.keyboard.press("Enter");
  // 저장(PUT …/answers) 뒤 표를 다시 읽을 때까지
  const haneulApp = people["최하늘"].applicationId;
  let after;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(300);
    const t = await api(op, "GET", `${ev}/applications/table`);
    after = rowOf(t, "최하늘");
    if (after.revision === 2) break;
  }
  expect(after.revision === 2 && after.revisedBy === "OPERATOR", "표: 최하늘 revision 2 · OPERATOR (운영자 대리 수정 경로)");
  expect(after.answers[ids.GENDER]?.optionId === "opt_male", "표: 성별 opt_male");
  const sheet = await api(op, "GET", `${ev}/roster-sheet`);
  const sheetCells = JSON.stringify(sheet).includes(people["최하늘"].participantId);
  expect(!sheetCells, "운영 시트 문서에 최하늘 답이 따로 저장되지 않음");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/m3-after-save-1440.png` });

  // 신청 상세
  await page.goto(`${APP}/events/${eventId}/participants/${after.applicationId}`);
  await page.getByText("최하늘").first().waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/m4-detail-1440.png`, fullPage: true });
  const detailText = await page.locator("main").innerText();
  expect(/성별\s*\n?\s*남성/.test(detailText), "신청 상세: 성별 남");
  expect(/운영자.*고침/.test(detailText), "신청 상세: 운영자 고침 기록");

  // 신청 집계
  const sum = await api(op, "GET", `${ev}/applications/summary`);
  const count = (s, id) => s.gender.options.find((o) => o.optionId === id).count;
  expect(count(sum, "opt_male") === count(before, "opt_male") + 1 && count(sum, "opt_female") === count(before, "opt_female") - 1,
    `신청 집계: 남 ${count(before, "opt_male")} → ${count(sum, "opt_male")}, 여 ${count(before, "opt_female")} → ${count(sum, "opt_female")}`);
  await page.goto(`${APP}/events/${eventId}/participants/summary`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/m5-summary-1440.png`, fullPage: true });

  // 390
  const mob = await ctx(phone);
  await api(mob, "POST", "/api/v1/operator/auth/login", { userId: OWNER });
  const mp = await mob.newPage();
  mp.on("pageerror", (e) => errors.push(e.message));
  await mp.goto(`${APP}/events/${eventId}/participants`);
  await mp.getByRole("grid", { name: "신청자 명단" }).waitFor();
  await mp.waitForTimeout(800);
  await mp.screenshot({ path: `${OUT}/m6-merged-390.png` });
  const ms = await mp.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  mark("390 가로", `scrollWidth ${ms[0]} / ${ms[1]}`);

  mark("콘솔 오류", errors.length ? errors.join(" | ").slice(0, 400) : "없음");
  fs.writeFileSync(`${OUT}/merge-click-log.txt`, log.join("\n") + "\n");
  await browser.close();
})().catch((error) => {
  console.error(error);
  fs.writeFileSync(`${OUT}/merge-click-log.txt`, log.join("\n") + "\nFAILED: " + error.message + "\n");
  process.exit(1);
});
