// 통합 브랜치 2(fixes + B5 + A12) 한 흐름 실제 클릭: 로컬 서버(local) + Vite(VITE_API_MOCK=0).
// 직접 추가 → 임시 번호 로그인·새 번호 → 운영자가 숙박 빼기 → 알림함 → 다시 볼 것 → 공지·일정·조·숙소 알림 → 날짜 없는 행사 일정 탭.
// Usage: node flow2.cjs <outDir>
const { chromium } = require("playwright");
const fs = require("fs");
const OUT = process.argv[2];
const APP = "http://localhost:5173";
const OWNER = "00000000-0000-4000-8000-000000000001";
const H = { "X-XSRF-TOKEN": "dev-csrf" };
const log = [];
const t0 = Date.now();
const mark = (s, e = "") => { const l = `${((Date.now() - t0) / 1000).toFixed(1)}s ${s}${e ? " — " + e : ""}`; log.push(l); console.log(l); };
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ko-KR", timezoneId: "Asia/Seoul" };
const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: "ko-KR", timezoneId: "Asia/Seoul" };
const shot = (page, name, fullPage = false) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
async function api(ctx, method, path, data) {
  const res = await ctx.request.fetch(`${APP}${path}`, { method, headers: H, data });
  const text = await res.text();
  if (res.status() >= 300) throw new Error(`${method} ${path} ${res.status()} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = async (o) => { const c = await browser.newContext(o); await c.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]); return c; };
  const op = await ctx(desktop);
  await api(op, "POST", "/api/v1/operator/auth/login", { userId: OWNER });
  const spaces = await api(op, "GET", "/api/v1/operator/spaces");
  const spaceId = (spaces.items ?? spaces)[0].spaceId;
  const today = new Date(Date.now() + 9 * 3600e3);
  const day = (o) => new Date(today.getTime() + o * 86400e3).toISOString().slice(0, 10);
  const { eventId } = await api(op, "POST", `/api/v1/operator/spaces/${spaceId}/events`, { name: "통합 2 확인 수련회", eventType: "RETREAT", startDate: day(1), endDate: day(3), place: "양평 수양관" });
  const ev = `/api/v1/operator/events/${eventId}`;
  const { formId } = await api(op, "POST", `${ev}/forms`, {});
  const sched = [{ breakfast: false, lunch: false, dinner: true, worship: true }, { breakfast: true, lunch: true, dinner: true, worship: true }, { breakfast: true, lunch: true, dinner: false, worship: false }];
  await api(op, "PUT", `${ev}/forms/${formId}/setup`, { gender: true, middleGroup: false, cell: false, attendance: { partial: true, worshipOnly: true, mode: "RANGE", noLodging: true }, schedule: sched, transport: { groupBus: false, worshipShuttle: false, car: false, publicTransit: false, support: false } });
  const d = await api(op, "GET", ev);
  await api(op, "POST", `${ev}/activate`, { expectedLifecycleVersion: d.lifecycleVersion });
  await api(op, "PATCH", `${ev}/forms/${formId}`, { acceptingApplications: true });
  const ids = {};
  for (const f of (await api(op, "GET", `${ev}/forms/${formId}`)).fields) { const k = f.presetKey ?? f.systemKey; if (k) ids[k] = f.fieldId; }
  const people = {};
  for (const [i, name] of ["김가람", "이나래"].entries()) {
    const c = await ctx(phone);
    const a = [{ fieldId: ids.NAME, text: name }, { fieldId: ids.PHONE, text: `010-4740-000${i + 1}` }, { fieldId: ids.COHORT, text: `9${i}` }, { fieldId: ids.GENDER, value: { optionId: "opt_male" } }, { fieldId: ids.ATTENDANCE, value: { optionId: "opt_full" } }];
    if (ids.CONSENT) a.push({ fieldId: ids.CONSENT, value: { value: true } });
    people[name] = await api(c, "POST", `/api/v1/public/events/${eventId}/forms/${formId}/applications`, { pin: "730914", answers: a });
  }
  // 첫 조 공개(직접 추가 전): 1조 김가람·이나래
  const g1 = (await api(op, "POST", `${ev}/groups`, { name: "1조" })).group;
  await api(op, "POST", `${ev}/group-assignments`, { changes: Object.values(people).map((p) => ({ participantId: p.participantId, fromGroupId: null, toGroupId: g1.groupId })) });
  let gb = await api(op, "GET", `${ev}/group-board`);
  await api(op, "POST", `${ev}/groups/publish`, { expectedBoardVersion: gb.boardVersion, confirmUnassigned: true });
  mark("준비(API)", `행사 ${eventId}(${day(1)}~${day(3)}), 신청 2명, 1조 공개`);

  // ---- 1. 운영자 화면: 참가자 직접 추가 ----
  const page = await op.newPage();
  await page.goto(`${APP}/events/${eventId}/participants`);
  await page.getByRole("link", { name: "참가자 추가" }).click();
  await page.getByRole("button", { name: "참가자 추가" }).waitFor();
  await page.getByLabel(/^이름/).fill("최현장");
  await page.getByLabel(/^전화/).fill("010-4740-0009");
  await page.getByLabel("전체 참석").check().catch(() => {});
  const male = page.getByLabel(/^남/).first();
  if (await male.count()) await male.check().catch(() => {});
  await page.getByRole("button", { name: "참가자 추가" }).click();
  const pin = (await page.getByLabel("임시 번호").textContent()).trim();
  await shot(page, "01-operator-added-temp-pin");
  mark("직접 추가(운영자 화면)", `최현장, 임시 번호 6자리 ${/^\d{6}$/.test(pin) ? "받음" : "형식 다름: " + pin}`);
  const table = await api(op, "GET", `${ev}/applications/table`);
  const added = table.rows.find((r) => r.name === "최현장" || JSON.stringify(r).includes("최현장"));
  const choiId = added?.participantId;
  const choiApp = added?.applicationId;
  mark("직접 추가 행", JSON.stringify({ revision: added?.revision, revisedBy: added?.revisedBy, group: added?.group ?? null }));

  // ---- 2. 참가자: 임시 번호로 들어와 새 번호 ----
  const choi = await ctx(phone);
  await api(choi, "POST", `/api/v1/public/events/${eventId}/participant-sessions`, { name: "최현장", phone: "010-4740-0009", pin });
  const cp = await choi.newPage();
  await cp.goto(`${APP}/participate/${eventId}`);
  await cp.getByText("새 숫자 6자리를 정해 주세요").waitFor({ timeout: 20000 });
  await shot(cp, "02-participant-new-pin");
  const pins = cp.locator("form input");
  await pins.nth(0).fill("482917");
  await pins.nth(1).fill("482917");
  await cp.getByRole("button", { name: "번호 정하기" }).click();
  await cp.getByRole("link", { name: /^알림함/ }).waitFor({ timeout: 20000 });
  mark("임시 번호 → 새 번호", "홈으로 들어옴, 머리글 종 보임");
  await shot(cp, "03-participant-home-after-pin", true);
  const myGroup = await api(choi, "GET", "/api/v1/participant/group").catch((e) => ({ error: String(e).slice(0, 120) }));
  mark("직접 추가한 사람의 내 조(조 없음)", JSON.stringify(myGroup).slice(0, 160));

  // ---- 3. 숙소: 최현장·김가람 301호 배정(작업본) 후 운영자가 최현장 숙박 빼기 ----
  const r301 = (await api(op, "POST", `${ev}/rooms`, { name: "301호", locationNote: "본관 3층", capacity: 4 })).room.roomId;
  await api(op, "POST", `${ev}/room-assignments`, { changes: [choiId, people["김가람"].participantId].map((id) => ({ participantId: id, fromRoomId: null, toRoomId: r301 })) });
  await page.goto(`${APP}/events/${eventId}/participants/${choiApp}`);
  await page.getByRole("link", { name: "신청 고치기" }).click();
  await page.getByRole("button", { name: "고친 내용 저장" }).waitFor();
  await page.getByLabel("부분 참석").check();
  const arrival = page.locator("fieldset", { has: page.locator("legend", { hasText: "도착하나요" }) });
  const departure = page.locator("fieldset", { has: page.locator("legend", { hasText: "출발하나요" }) });
  await arrival.waitFor();
  await arrival.locator('input[type="radio"]').nth(1).check();
  await departure.locator('input[type="radio"]').nth(3).check();
  await page.getByLabel("수련회장에서 숙박하지 않아요").check();
  await page.getByRole("button", { name: "고친 내용 저장" }).click();
  await page.getByText(/고친 내용을 저장했어요/).waitFor();
  await shot(page, "04-operator-edit-saved");
  mark("운영자가 신청 고치기(화면)", "부분 참석 + 숙박하지 않아요 저장");

  // ---- 4. 참가자 알림함: 운영자 수정 한 줄 → 내 정보 ----
  async function openRow(re, landing, label) {
    await cp.goto(`${APP}/participate/${eventId}`);
    const bell = cp.getByRole("link", { name: /^알림함/ });
    await bell.waitFor({ timeout: 20000 });
    const badge = await bell.getAttribute("aria-label");
    await bell.click();
    const row = cp.locator(".participant-inbox__rows li", { hasText: re }).first();
    await row.waitFor({ timeout: 20000 });
    const text = (await row.innerText()).replace(/\n+/g, " / ");
    await shot(cp, `${label}-a-row`);
    await row.locator("button, a").first().click();
    await cp.waitForTimeout(1200);
    const path = new URL(cp.url()).pathname.replace(`/participate/${eventId}`, "") || "/";
    const ok = landing.test(path);
    await shot(cp, `${label}-b-landing`);
    mark(`알림 ${label}`, `종 "${badge}" · 줄 "${text}" → ${path} ${ok ? "(맞음)" : "(다름)"}`);
  }
  await openRow(/고쳤|운영자/, /^\/me/, "05-operator-edit");

  // ---- 5. 숙소 배정판 다시 볼 것 ----
  await page.goto(`${APP}/events/${eventId}/rooms`);
  const review = page.getByRole("region", { name: /다시 볼 것/ });
  await review.waitFor({ timeout: 20000 });
  mark("숙소 배정판 다시 볼 것", (await review.innerText()).replace(/\n+/g, " / ").slice(0, 200));
  await review.scrollIntoViewIfNeeded();
  await shot(page, "06-rooms-review");

  // ---- 6. 공지·일정·조·숙소 알림 ----
  await api(op, "POST", `${ev}/notices`, { title: "첫날 집합 장소 안내", body: "본관 로비에서 모여요.", audience: [{ type: "ALL" }], publish: true });
  await openRow(/첫날 집합 장소 안내/, /^\/notices\/.+/, "07-notice");
  await api(op, "POST", `${ev}/schedule/items`, { day: 1, startTime: "19:30", title: "여는 집회", category: "WORSHIP", audience: [{ type: "ALL" }] });
  const sb = await api(op, "GET", `${ev}/schedule`);
  await api(op, "POST", `${ev}/schedule/publish`, { expectedBoardVersion: sb.boardVersion, notify: true });
  await openRow(/일정/, /^\/schedule/, "08-schedule");
  await api(op, "POST", `${ev}/group-assignments`, { changes: [{ participantId: choiId, fromGroupId: null, toGroupId: g1.groupId }] });
  gb = await api(op, "GET", `${ev}/group-board`);
  const gp = await api(op, "POST", `${ev}/groups/publish`, { expectedBoardVersion: gb.boardVersion, confirmUnassigned: true });
  mark("직접 추가한 사람을 1조에 넣고 다시 조 공개", gp.result);
  await openRow(/조/, /^\/group/, "09-group");
  const rb = await api(op, "GET", `${ev}/room-board`);
  await api(op, "POST", `${ev}/rooms/publish`, { expectedBoardVersion: rb.boardVersion, confirmUnassigned: true, confirmNotLodging: true, notify: true });
  await openRow(/숙소/, /^\/rooms/, "10-rooms");
  const all = await api(choi, "GET", "/api/v1/participant/notifications");
  mark("최현장 알림 종류", all.items.map((n) => n.kind).join(", "));

  // ---- 7. 날짜 없는 행사: 참가자 일정 탭 ----
  const { eventId: e2 } = await api(op, "POST", `/api/v1/operator/spaces/${spaceId}/events`, { name: "날짜 없는 행사", eventType: "RETREAT" });
  const ev2 = `/api/v1/operator/events/${e2}`;
  const { formId: f2 } = await api(op, "POST", `${ev2}/forms`, {});
  const d2 = await api(op, "GET", ev2);
  await api(op, "POST", `${ev2}/activate`, { expectedLifecycleVersion: d2.lifecycleVersion });
  await api(op, "PATCH", `${ev2}/forms/${f2}`, { acceptingApplications: true });
  const ids2 = {};
  for (const f of (await api(op, "GET", `${ev2}/forms/${f2}`)).fields) { const k = f.presetKey ?? f.systemKey; if (k) ids2[k] = f.fieldId; }
  const nd = await ctx(phone);
  const a2 = [{ fieldId: ids2.NAME, text: "날짜없음" }, { fieldId: ids2.PHONE, text: "010-4740-0077" }];
  if (ids2.COHORT) a2.push({ fieldId: ids2.COHORT, text: "94" });
  if (ids2.CONSENT) a2.push({ fieldId: ids2.CONSENT, value: { value: true } });
  await api(nd, "POST", `/api/v1/public/events/${e2}/forms/${f2}/applications`, { pin: "730914", answers: a2 });
  const res = await nd.request.fetch(`${APP}/api/v1/participant/schedule`, { headers: H });
  const np = await nd.newPage();
  await np.goto(`${APP}/participate/${e2}/schedule`);
  await np.waitForTimeout(3000);
  const path2 = new URL(np.url()).pathname;
  mark("날짜 없는 행사 일정 탭", `GET /participant/schedule ${res.status()}, 화면 주소 ${path2.replace(e2, "{eventId}")}, 글 "${(await np.locator("main").innerText().catch(() => "")).replace(/\n+/g, " / ").slice(0, 120)}"`);
  await shot(np, "11-no-date-schedule-tab");

  fs.writeFileSync(`${OUT}/click-log.txt`, log.join("\n") + "\n");
  await browser.close();
})().catch((e) => { console.error(e); fs.writeFileSync(`${OUT}/click-log.txt`, log.join("\n") + "\nFAILED: " + e.message + "\n"); process.exit(1); });
