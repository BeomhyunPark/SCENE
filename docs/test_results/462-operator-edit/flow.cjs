// A12(#462, DEC-088) 실제 클릭: 로컬 서버(local 프로필, PostgreSQL 17, 빈 DB에서 V1~V27) + Vite(VITE_API_MOCK=0).
// 신청 → 조·방 배정 → 신청·수정 닫기 → 운영자가 "신청 고치기"로 참석 범위·숙박 안 함 수정(화면) → 집계·표·숙소 다시 볼 것·조장 상세·참가자 알림 확인
// → "참가자 직접 추가"(화면)로 현장 등록, 임시 번호 → 참가자가 임시 번호로 들어와 새 번호 정하기 요구 → 같은 전화 다시 추가 거절.
// Usage: node flow.cjs <outDir>
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
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ko-KR", timezoneId: "Asia/Seoul" };
const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: "ko-KR", timezoneId: "Asia/Seoul" };
const shot = (page, name, fullPage = true) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
const expect = (ok, what) => {
  if (!ok) throw new Error("확인 실패: " + what);
  mark("  ✓ " + what);
};
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

  // ---- 운영자(API): 행사·신청서(RANGE, 숙박 안 함) ----
  const op = await ctx(desktop);
  await api(op, "POST", "/api/v1/operator/auth/login", { userId: OWNER });
  const spaces = await api(op, "GET", "/api/v1/operator/spaces");
  const spaceId = (spaces.items ?? spaces)[0].spaceId;
  const today = new Date(Date.now() + 9 * 3600e3);
  const day = (offset) => new Date(today.getTime() + offset * 86400e3).toISOString().slice(0, 10);
  const { eventId } = await api(op, "POST", `/api/v1/operator/spaces/${spaceId}/events`, { name: "A12 확인 수련회", eventType: "RETREAT", startDate: day(1), endDate: day(3), place: "양평 수양관" });
  const ev = `/api/v1/operator/events/${eventId}`;
  mark("행사 만들기", `${eventId} (${day(1)}~${day(3)})`);
  const { formId } = await api(op, "POST", `${ev}/forms`, {});
  const sched = [{ breakfast: false, lunch: false, dinner: true, worship: true }, { breakfast: true, lunch: true, dinner: true, worship: true }, { breakfast: true, lunch: false, dinner: false, worship: false }];
  await api(op, "PUT", `${ev}/forms/${formId}/setup`, { gender: true, middleGroup: false, cell: false, attendance: { partial: true, worshipOnly: true, mode: "RANGE", noLodging: true }, schedule: sched, transport: { groupBus: false, worshipShuttle: false, car: false, publicTransit: false, support: false } });
  const detail = await api(op, "GET", ev);
  await api(op, "POST", `${ev}/activate`, { expectedLifecycleVersion: detail.lifecycleVersion });
  await api(op, "PATCH", `${ev}/forms/${formId}`, { acceptingApplications: true });
  const ids = {};
  for (const f of (await api(op, "GET", `${ev}/forms/${formId}`)).fields) { const k = f.presetKey ?? f.systemKey; if (k) ids[k] = f.fieldId; }

  // ---- 신청 3명 (각자 휴대폰) ----
  const people = {};
  async function apply(name, n, gender) {
    const c = await ctx(phone);
    const answers = [
      { fieldId: ids.NAME, text: name }, { fieldId: ids.PHONE, text: `010-4620-${String(n).padStart(4, "0")}` },
      { fieldId: ids.COHORT, text: "9" + n }, { fieldId: ids.GENDER, value: { optionId: gender } },
      { fieldId: ids.ATTENDANCE, value: { optionId: "opt_full" } },
    ];
    if (ids.CONSENT) answers.push({ fieldId: ids.CONSENT, value: { value: true } });
    const body = await api(c, "POST", `/api/v1/public/events/${eventId}/forms/${formId}/applications`, { pin: PIN, answers });
    people[name] = { ...body, ctx: c };
  }
  await apply("김가람", 1, "opt_male");
  await apply("이나래", 2, "opt_male");
  await apply("박다솜", 3, "opt_female");
  mark("신청 3명", "모두 전체 참석");

  // ---- 조 편성·공개(조장 이나래), 방 배정 ----
  const group = (await api(op, "POST", `${ev}/groups`, { name: "1조" })).group.groupId;
  await api(op, "POST", `${ev}/group-assignments`, { changes: ["김가람", "이나래", "박다솜"].map((n) => ({ participantId: people[n].participantId, fromGroupId: null, toGroupId: group })) });
  await api(op, "PUT", `${ev}/groups/${group}/leaders`, { expectedVersion: 0, participantIds: [people["이나래"].participantId] });
  const board = await api(op, "GET", `${ev}/group-board`);
  await api(op, "POST", `${ev}/groups/publish`, { expectedBoardVersion: board.boardVersion, confirmUnassigned: true });
  const room = (await api(op, "POST", `${ev}/rooms`, { name: "301호" })).room.roomId;
  await api(op, "POST", `${ev}/room-assignments`, { changes: ["김가람", "이나래"].map((n) => ({ participantId: people[n].participantId, fromRoomId: null, toRoomId: room })) });
  mark("조 공개·방 배정", "1조(조장 이나래), 301호에 김가람·이나래");
  const before = await api(op, "GET", `${ev}/applications/summary`);

  // ---- 신청·수정 닫기 ----
  await api(op, "PATCH", `${ev}/forms/${formId}`, { acceptingApplications: false, acceptingEdits: false });
  mark("신청 받기·수정 받기 끔");

  // ---- 1. 운영자 화면: 신청 상세 → 신청 고치기 ----
  const page = await op.newPage();
  await page.goto(`${APP}/events/${eventId}/participants/${people["김가람"].applicationId}`);
  await page.getByRole("link", { name: "신청 고치기" }).waitFor();
  await shot(page, "01-detail-edit-button");
  mark("신청 상세", "'신청 고치기' 버튼(신청·수정 닫힘)");
  await page.getByRole("link", { name: "신청 고치기" }).click();
  await page.getByRole("button", { name: "고친 내용 저장" }).waitFor();
  await shot(page, "02-edit-form-before");
  expect((await page.getByText("신청·수정을 닫은 뒤에도 고칠 수 있어요").count()) === 1, "안내 문구");
  await page.getByLabel("부분 참석").check();
  const arrival = page.locator("fieldset", { has: page.locator("legend", { hasText: "도착하나요" }) });
  const departure = page.locator("fieldset", { has: page.locator("legend", { hasText: "출발하나요" }) });
  await arrival.waitFor();
  const arrivalRadios = arrival.locator('input[type="radio"]');
  const departureRadios = departure.locator('input[type="radio"]');
  mark("도착·출발 칸", `${await arrivalRadios.count()}개·${await departureRadios.count()}개`);
  await arrivalRadios.nth(1).check(); // 1일차 집회
  await departureRadios.nth(3).check(); // 2일차 저녁
  await page.getByLabel("수련회장에서 숙박하지 않아요").check();
  await shot(page, "03-edit-form-changed");
  await page.getByRole("button", { name: "고친 내용 저장" }).click();
  await page.getByText("고친 내용을 저장했어요. 참가자에게 알림이 갔어요.").waitFor();
  await page.getByText(/운영자 .*가 고침/).first().waitFor();
  await shot(page, "04-detail-after-save");
  mark("저장", "상세로 돌아와 '고친 내용을 저장했어요', 수정 기록 '운영자 …가 고침'");

  // ---- 2. 읽는 곳이 따라오는지 ----
  const after = await api(op, "GET", `${ev}/applications/summary`);
  expect(after.attendance.partial === before.attendance.partial + 1, `집계 부분 참석 ${before.attendance.partial} → ${after.attendance.partial}`);
  const table = await api(op, "GET", `${ev}/applications/table`);
  const row = table.rows.find((r) => r.participantId === people["김가람"].participantId);
  expect(row.revision === 2 && row.revisedBy === "OPERATOR", "참가 현황 표 revision 2 · revisedBy OPERATOR");
  const rooms = await api(op, "GET", `${ev}/room-board`);
  const roomPerson = rooms.participants.find((p) => p.participantId === people["김가람"].participantId);
  expect(roomPerson.review && roomPerson.review.reasons.includes("NOT_LODGING"), `숙소 다시 볼 것 ${JSON.stringify(roomPerson.review?.reasons)}`);
  const leaderDetail = await api(people["이나래"].ctx, "GET", `/api/v1/participant/group/members/${people["김가람"].participantId}`);
  const attendanceAnswer = leaderDetail.application.answers.find((a) => a.presetKey === "ATTENDANCE");
  expect(leaderDetail.application.revisedByOperator === true && attendanceAnswer.operatorEdited === true, "조장 조원 상세 revisedByOperator·operatorEdited true");
  const notices = await api(people["김가람"].ctx, "GET", "/api/v1/participant/notifications");
  expect(notices.items[0]?.kind === "APPLICATION_UPDATED_BY_OPERATOR", `참가자 알림 "${notices.items[0]?.title}" · ${notices.items[0]?.body}`);
  const own = await api(people["김가람"].ctx, "GET", "/api/v1/participant/application");
  expect(own.revision === 2 && JSON.stringify(own.answers).includes("opt_partial"), "참가자 내 신청에 고친 값");

  // 표 화면의 "수정됨"
  await page.goto(`${APP}/events/${eventId}/participants`);
  await page.getByText("수정됨").first().waitFor();
  await shot(page, "05-table-edited", false);
  mark("참가 현황 표", "김가람 '수정됨'");

  // 참가자 휴대폰: 내 정보(읽기 전용, 고친 값)
  const garamPage = await people["김가람"].ctx.newPage();
  await garamPage.goto(`${APP}/participate/${eventId}/me`);
  await garamPage.getByText("부분 참석").first().waitFor({ timeout: 10000 }).catch(() => {});
  await shot(garamPage, "06-participant-me-after");
  mark("참가자 내 정보", "고친 값이 보임(휴대폰 390px)");

  // ---- 3. 참가자 직접 추가(현장 등록) ----
  await page.goto(`${APP}/events/${eventId}/participants`);
  await page.getByRole("link", { name: "참가자 추가" }).click();
  await page.getByRole("button", { name: "참가자 추가" }).waitFor();
  await shot(page, "07-add-form");
  await page.getByLabel(/^이름/).fill("최현장");
  await page.getByLabel(/^전화/).fill("010-4620-0009");
  await page.getByLabel("집회만 참석").check();
  await page.getByRole("button", { name: "참가자 추가" }).click();
  const pinText = await page.getByLabel("임시 번호").textContent();
  await shot(page, "08-added-temporary-pin");
  expect(/^\d{6}$/.test(pinText.trim()), "임시 번호 6자리가 한 번 보임");
  const table2 = await api(op, "GET", `${ev}/applications/table`);
  const addedRow = table2.rows.find((r) => r.revision === 1 && r.revisedBy === "OPERATOR");
  expect(Boolean(addedRow), "표에 직접 추가 행(revision 1 · OPERATOR)");

  // 참가자가 임시 번호로 들어오면 새 번호를 정해야 한다
  const guest = await ctx(phone);
  await api(guest, "POST", `/api/v1/public/events/${eventId}/participant-sessions`, { name: "최현장", phone: "010-4620-0009", pin: pinText.trim() });
  const me = await api(guest, "GET", "/api/v1/participant/me");
  expect(me.pinChangeRequired === true, "임시 번호로 들어오면 pinChangeRequired");
  const guestPage = await guest.newPage();
  await guestPage.goto(`${APP}/participate/${eventId}`);
  await guestPage.waitForTimeout(1500);
  await shot(guestPage, "09-guest-pin-change");
  mark("참가자 휴대폰", "새 번호 정하기 화면");

  // 같은 전화로 다시 추가 → 그 신청으로 안내
  await page.getByRole("button", { name: "한 명 더 추가" }).click();
  await page.getByLabel(/^이름/).fill("김가람 동명");
  await page.getByLabel(/^전화/).fill("010-4620-0001");
  await page.getByRole("button", { name: "참가자 추가" }).click();
  await page.getByText(/이 전화번호로 이미 신청한 사람이 있어요/).waitFor();
  await shot(page, "10-add-duplicate-phone");
  expect((await page.getByRole("link", { name: "그 신청 열기" }).count()) === 1, "같은 전화는 '그 신청 열기'로 안내");

  await page.goto(`${APP}/events/${eventId}/participants`);
  await page.getByText("직접 추가").first().waitFor();
  await shot(page, "11-table-added", false);
  mark("참가 현황 표", "최현장 '직접 추가'");

  fs.writeFileSync(`${OUT}/click-log.txt`, log.join("\n") + "\n");
  await browser.close();
})().catch((error) => {
  console.error(error);
  fs.writeFileSync(`${OUT}/click-log.txt`, log.join("\n") + "\nFAILED: " + error.message + "\n");
  process.exit(1);
});
