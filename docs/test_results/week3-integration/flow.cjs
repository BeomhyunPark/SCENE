// 3주차 통합 브랜치(claude/week3-integration) 한 흐름 실제 클릭: 로컬 서버(local 프로필, PostgreSQL 17) + Vite(VITE_API_MOCK=0).
// 신청 → 조 편성·공개 → 숙소 방 만들기·배정·공개(화면) → 참가자 홈(내 조·숙소) → 조장 조원 현황 → 체크인 → 현장 명단 → 식수 현황.
// Usage: node flow.cjs <outDir>
const { chromium } = require("playwright");
const fs = require("fs");
const crypto = require("crypto");
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
function pickOption(select, source) {
  const option = [...select.options].find((item) => new RegExp(source).test(item.textContent));
  if (!option) throw new Error("no option " + source + " in " + [...select.options].map((o) => o.textContent).join("|"));
  select.value = option.value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}
async function api(ctx, method, path, data, extra = {}) {
  const res = await ctx.request.fetch(`${APP}${path}`, { method, headers: { ...H, ...extra }, data });
  const text = await res.text();
  if (res.status() >= 300) throw new Error(`${method} ${path} ${res.status()} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
async function noOverflow(page, selector) {
  return page.evaluate((sel) => [...document.querySelectorAll(sel)].map((el) => ({ text: el.innerText.replace(/\n/g, " / ").slice(0, 160), over: el.scrollWidth > el.clientWidth + 1 })), selector);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = async (options) => {
    const c = await browser.newContext(options);
    await c.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
    return c;
  };

  // ---- 운영자: 행사(오늘이 둘째 날)·신청서 ----
  const op = await ctx(desktop);
  await api(op, "POST", "/api/v1/operator/auth/login", { userId: OWNER });
  const spaces = await api(op, "GET", "/api/v1/operator/spaces");
  const spaceId = (spaces.items ?? spaces)[0].spaceId;
  const today = new Date(Date.now() + 9 * 3600e3);
  const day = (offset) => new Date(today.getTime() + offset * 86400e3).toISOString().slice(0, 10);
  const { eventId } = await api(op, "POST", `/api/v1/operator/spaces/${spaceId}/events`, { name: "3주차 통합 확인 수련회", eventType: "RETREAT", startDate: day(-1), endDate: day(1), place: "양평 수양관" });
  const ev = `/api/v1/operator/events/${eventId}`;
  mark("행사 만들기", `${eventId} (${day(-1)}~${day(1)}, 오늘이 둘째 날)`);
  const { formId } = await api(op, "POST", `${ev}/forms`, {});
  const sched = [{ breakfast: false, lunch: false, dinner: true, worship: true }, { breakfast: true, lunch: true, dinner: true, worship: true }, { breakfast: true, lunch: true, dinner: false, worship: false }];
  await api(op, "PUT", `${ev}/forms/${formId}/setup`, { gender: true, middleGroup: false, cell: false, attendance: { partial: true, worshipOnly: true, mode: "RANGE" }, schedule: sched, transport: { groupBus: false, worshipShuttle: false, car: false, publicTransit: false, support: false } });
  const detail = await api(op, "GET", ev);
  await api(op, "POST", `${ev}/activate`, { expectedLifecycleVersion: detail.lifecycleVersion });
  await api(op, "PATCH", `${ev}/forms/${formId}`, { acceptingApplications: true });
  const ids = {};
  for (const f of (await api(op, "GET", `${ev}/forms/${formId}`)).fields) { const k = f.presetKey ?? f.systemKey; if (k) ids[k] = f.fieldId; }

  // ---- 신청 8명 (각자 휴대폰) ----
  const people = {};
  async function apply(name, n, cohort, gender, kind) {
    const c = await ctx(phone);
    const answers = [
      { fieldId: ids.NAME, text: name }, { fieldId: ids.PHONE, text: `010-3300-${String(n).padStart(4, "0")}` },
      { fieldId: ids.COHORT, text: cohort }, { fieldId: ids.GENDER, value: { optionId: gender } },
    ];
    if (ids.CONSENT) answers.push({ fieldId: ids.CONSENT, value: { value: true } });
    if (kind === "full") answers.push({ fieldId: ids.ATTENDANCE, value: { optionId: "opt_full" } });
    if (kind === "worship") answers.push({ fieldId: ids.ATTENDANCE, value: { optionId: "opt_worship" } }, { fieldId: ids.MEALS, value: { optionIds: ["opt_d1_worship"] } });
    if (kind.startsWith("partial:")) {
      const [, a, d] = kind.split(":");
      answers.push({ fieldId: ids.ATTENDANCE, value: { optionId: "opt_partial" } }, { fieldId: ids.ARRIVAL_SLOT, value: { optionId: a } }, { fieldId: ids.DEPARTURE_SLOT, value: { optionId: d } });
    }
    const body = await api(c, "POST", `/api/v1/public/events/${eventId}/forms/${formId}/applications`, { pin: PIN, answers });
    people[name] = { ctx: c, participantId: body.participantId, name };
  }
  await apply("김하늘", 1, "94", "opt_male", "full");
  await apply("이도윤", 2, "95", "opt_male", "full");
  await apply("박서준", 3, "96", "opt_male", "partial:opt_d2_dinner:opt_d3_lunch"); // 오늘 저녁 도착 → 올 예정
  await apply("정집회", 4, "98", "opt_male", "worship"); // 숙박 안 함
  await apply("최예린", 5, "97", "opt_female", "full");
  await apply("한수아", 6, "99", "opt_female", "full");
  await apply("윤새벽", 7, "00", "opt_female", "partial:opt_d2_breakfast:opt_d3_lunch"); // 오늘 아침 도착 → 왔어야 함
  await apply("오다은", 8, "01", "opt_female", "full");
  mark("신청 8명", Object.keys(people).join(", "));
  const pid = (n) => people[n].participantId;

  // ---- 조 편성·공개 (운영자 API) ----
  const g1 = (await api(op, "POST", `${ev}/groups`, { name: "1조" })).group;
  const g2 = (await api(op, "POST", `${ev}/groups`, { name: "2조" })).group;
  const move = (names, g) => names.map((n) => ({ participantId: pid(n), fromGroupId: null, toGroupId: g.groupId }));
  await api(op, "POST", `${ev}/group-assignments`, { changes: [...move(["김하늘", "이도윤", "박서준", "정집회"], g1), ...move(["최예린", "한수아", "윤새벽", "오다은"], g2)] });
  const b1 = await api(op, "GET", `${ev}/group-board`);
  const ver = (g) => (b1.groups.find((x) => x.groupId === g.groupId) ?? {}).version ?? 0;
  await api(op, "PUT", `${ev}/groups/${g1.groupId}/leaders`, { participantIds: [pid("김하늘")], expectedVersion: ver(g1) });
  await api(op, "PUT", `${ev}/groups/${g2.groupId}/leaders`, { participantIds: [pid("최예린")], expectedVersion: ver(g2) });
  const b2 = await api(op, "GET", `${ev}/group-board`);
  const gp = await api(op, "POST", `${ev}/groups/publish`, { expectedBoardVersion: b2.boardVersion, confirmUnassigned: true });
  mark("조 편성·공개(API)", `1조 4명(조장 김하늘) · 2조 4명(조장 최예린) → ${gp.result}`);

  // ---- 숙소: 운영자 화면에서 방 만들기·조 단위 넣기·공개 ----
  const page = await op.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${APP}/events/${eventId}/rooms`);
  await page.getByText(/^배정 \d/).waitFor();
  for (const [name, note, cap, gender] of [["301호", "본관 3층 왼쪽", "4", "남"], ["302호", "본관 3층 오른쪽", "4", "여"]]) {
    await page.getByRole("button", { name: "+ 방 추가" }).click();
    await page.getByRole("radio", { name: "한 개" }).check();
    const one = page.getByRole("form", { name: "방 만들기" });
    await one.getByLabel("방 이름").fill(name);
    await one.getByLabel("정원").fill(cap);
    await one.getByLabel("성별 구분").evaluate(pickOption, `^${gender}`);
    await one.getByLabel(/위치 메모/).fill(note);
    await one.getByRole("button", { name: "방 만들기" }).click();
    await page.getByRole("article", { name }).waitFor();
    const close = page.getByRole("button", { name: "닫기" });
    if (await close.isVisible().catch(() => false)) await close.click();
  }
  mark("방 만들기(화면)", "301호(남, 정원 4) · 302호(여, 정원 4)");
  const batch = page.getByRole("region", { name: "조 단위로 넣기" });
  for (const [group, room] of [["1조", "301호"], ["2조", "302호"]]) {
    const selects = batch.locator("select");
    const n = await selects.count();
    await selects.nth(n - 2).evaluate(pickOption, `^${group}`);
    await selects.nth(n - 1).evaluate(pickOption, `^${room}`);
    const note = await batch.locator(".event-rooms__not-lodging-note").allTextContents();
    await batch.getByRole("button", { name: /명 넣기$/ }).click();
    await page.waitForTimeout(1200);
    mark(`조 단위 넣기 ${group}→${room}(화면)`, note.join(" / "));
  }
  await shot(page, "01-operator-rooms-filled", false);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "참가자에게 공개" }).click();
  await page.getByRole("dialog").waitFor();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: /^(공개|확인하고 공개)$/ }).first().click();
  if (await dlg.getByRole("button", { name: "확인하고 공개" }).isVisible().catch(() => false)) await dlg.getByRole("button", { name: "확인하고 공개" }).click();
  await page.waitForTimeout(1500);
  const published = await api(op, "GET", `${ev}/rooms/published`);
  mark("숙소 공개(화면)", `방 ${published.rooms.map((r) => `${r.name} ${r.members.length}명`).join(", ")}, 미배정 ${published.unassigned.length}명`);
  await shot(page, "02-operator-rooms-published", false);

  // ---- 참가자 홈: 조장 김하늘(내 조·숙소 카드), 조원 이도윤(내 조 명단) ----
  const leader = await people["김하늘"].ctx.newPage();
  await leader.goto(`${APP}/participate/${eventId}`);
  await leader.getByRole("region", { name: "숙소" }).getByText("301호").first().waitFor({ timeout: 40000 });
  mark("참가자 홈(조장 김하늘)", (await leader.getByRole("region", { name: "숙소" }).innerText()).replace(/\n/g, " / "));
  await shot(leader, "03-participant-home-leader");
  const member = await people["이도윤"].ctx.newPage();
  await member.goto(`${APP}/participate/${eventId}/group`);
  await member.getByText("김하늘").first().waitFor({ timeout: 30000 });
  mark("내 조 명단(조원 이도윤)", (await member.locator("main").innerText()).replace(/\n/g, " / ").slice(0, 300));
  await shot(member, "04-participant-group-member");
  await member.goto(`${APP}/participate/${eventId}/rooms`);
  await member.getByText("전체 방 배정표").first().waitFor({ timeout: 30000 });
  await shot(member, "05-participant-rooms-screen");
  mark("숙소 화면(조원 이도윤)", (await member.locator("main").innerText()).replace(/\n/g, " / ").slice(0, 300));

  // ---- 조장 조원 현황(방 표시) ----
  await leader.goto(`${APP}/participate/${eventId}/group`);
  await leader.getByText("이도윤").first().waitFor({ timeout: 30000 });
  await leader.waitForTimeout(800);
  const leaderText = await leader.locator("main").innerText();
  mark("조장 조원 현황", leaderText.replace(/\n/g, " / ").slice(0, 400));
  await shot(leader, "06-leader-group-status");
  await leader.goto(`${APP}/participate/${eventId}/group/members/${pid("이도윤")}`);
  await leader.getByText(/301호/).first().waitFor({ timeout: 15000 });
  mark("조원 상세(이도윤, 주소로 열기)", (await leader.locator("main").innerText()).replace(/\n/g, " / ").slice(0, 300));
  await shot(leader, "07-leader-member-detail");

  // ---- 체크인·현장 명단(휴대폰 폭) ----
  const field = await (await (async () => { const c = await ctx(phone); await api(c, "POST", "/api/v1/operator/auth/login", { userId: OWNER }); return c; })()).newPage();
  await field.goto(`${APP}/events/${eventId}/field`);
  await field.getByRole("button", { name: /김하늘 체크인$/ }).waitFor({ timeout: 30000 });
  await field.getByRole("button", { name: /김하늘 체크인$/ }).click();
  const notice = field.getByText(/김하늘 님을 체크인했어요/).first();
  await notice.waitFor({ timeout: 15000 });
  mark("체크인(현장 운영 화면)", (await notice.innerText()).replace(/\n/g, " "));
  await shot(field, "08-field-checkin-notice", false);
  await field.waitForTimeout(800);
  const rows = await noOverflow(field, ".event-field__row");
  const docOver = await field.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  for (const r of rows) mark("현장 명단 줄", `${r.text}${r.over ? " [넘침]" : ""}`);
  mark("현장 명단 가로 넘침", `문서 ${docOver ? "있음" : "없음"}, 줄 ${rows.filter((r) => r.over).length}개`);
  await shot(field, "09-field-roster-phone");
  // 박서준(올 예정)·윤새벽(왔어야 함) 줄에 도착 예정과 방이 같이
  for (const n of ["박서준", "윤새벽", "정집회"]) {
    const row = field.locator(".event-field__row", { hasText: n }).first();
    if (await row.count()) {
      await row.scrollIntoViewIfNeeded();
      await row.screenshot({ path: `${OUT}/10-field-row-${n}.png` });
      const box = await row.boundingBox();
      mark(`줄 ${n}`, `${(await row.innerText()).replace(/\n/g, " / ")} (폭 ${Math.round(box.width)}px)`);
    }
  }

  // ---- 식수 현황 ----
  await field.goto(`${APP}/events/${eventId}/meals`);
  await field.getByRole("heading", { name: "식수 현황", level: 2 }).waitFor({ timeout: 20000 });
  await field.waitForTimeout(1000);
  mark("식수 현황", (await field.locator("main").innerText()).replace(/\n/g, " / ").slice(0, 400));
  await shot(field, "11-meals-phone");

  if (errors.length) mark("운영자 화면 콘솔 오류", errors.join(" | ").slice(0, 400));
  fs.writeFileSync(`${OUT}/click-log.txt`, log.join("\n") + "\n");
  await browser.close();
})().catch((error) => {
  console.error(error);
  fs.writeFileSync(`${OUT}/click-log.txt`, log.join("\n") + "\nFAILED: " + error.message + "\n");
  process.exit(1);
});
