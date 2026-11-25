// 최신 main(UI/UX #472)을 합친 통합 브랜치 확인: 현장 운영(390·1440)과 3주차 화면을 새 셸에서 연다.
// 행사·신청·조·숙소 준비는 운영자 API. Usage: node flow-main.cjs <outDir>
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
const shot = (page, name, fullPage = true) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
async function api(ctx, method, path, data) {
  const res = await ctx.request.fetch(`${APP}${path}`, { method, headers: H, data });
  const text = await res.text();
  if (res.status() >= 300) throw new Error(`${method} ${path} ${res.status()} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const overflow = (page) => page.evaluate(() => {
  const doc = document.documentElement.scrollWidth > document.documentElement.clientWidth;
  const rows = [...document.querySelectorAll(".event-field__row")].filter((el) => el.scrollWidth > el.clientWidth + 1).length;
  const main = document.querySelector("main, .operator-shell__main");
  return { doc, rows, mainWidth: main ? Math.round(main.getBoundingClientRect().width) : null };
});

(async () => {
  const browser = await chromium.launch();
  const ctx = async (o) => { const c = await browser.newContext(o); await c.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]); return c; };
  const op = await ctx(desktop);
  await api(op, "POST", "/api/v1/operator/auth/login", { userId: OWNER });
  const spaces = await api(op, "GET", "/api/v1/operator/spaces");
  const spaceId = (spaces.items ?? spaces)[0].spaceId;
  const today = new Date(Date.now() + 9 * 3600e3);
  const day = (o) => new Date(today.getTime() + o * 86400e3).toISOString().slice(0, 10);
  const { eventId } = await api(op, "POST", `/api/v1/operator/spaces/${spaceId}/events`, { name: "3주차 + UI/UX 확인 수련회", eventType: "RETREAT", startDate: day(-1), endDate: day(1), place: "양평 수양관" });
  const ev = `/api/v1/operator/events/${eventId}`;
  const { formId } = await api(op, "POST", `${ev}/forms`, {});
  const sched = [{ breakfast: false, lunch: false, dinner: true, worship: true }, { breakfast: true, lunch: true, dinner: true, worship: true }, { breakfast: true, lunch: true, dinner: false, worship: false }];
  await api(op, "PUT", `${ev}/forms/${formId}/setup`, { gender: true, middleGroup: false, cell: false, attendance: { partial: true, worshipOnly: true, mode: "RANGE" }, schedule: sched, transport: { groupBus: false, worshipShuttle: false, car: false, publicTransit: false, support: false } });
  const d = await api(op, "GET", ev);
  await api(op, "POST", `${ev}/activate`, { expectedLifecycleVersion: d.lifecycleVersion });
  await api(op, "PATCH", `${ev}/forms/${formId}`, { acceptingApplications: true });
  const ids = {};
  for (const f of (await api(op, "GET", `${ev}/forms/${formId}`)).fields) { const k = f.presetKey ?? f.systemKey; if (k) ids[k] = f.fieldId; }
  await api(op, "POST", `${ev}/schedule/items`, { day: 2, startTime: "12:00", title: "점심 식사", category: "MEAL", audience: [{ type: "ALL" }], slotId: "opt_d2_lunch" }).catch((e) => mark("일정 항목 만들기 실패", String(e).slice(0, 160)));
  const people = {};
  async function apply(name, n, cohort, gender, kind) {
    const c = await ctx(phone);
    const a = [{ fieldId: ids.NAME, text: name }, { fieldId: ids.PHONE, text: `010-4700-${String(n).padStart(4, "0")}` }, { fieldId: ids.COHORT, text: cohort }, { fieldId: ids.GENDER, value: { optionId: gender } }];
    if (ids.CONSENT) a.push({ fieldId: ids.CONSENT, value: { value: true } });
    if (kind === "full") a.push({ fieldId: ids.ATTENDANCE, value: { optionId: "opt_full" } });
    if (kind === "worship") a.push({ fieldId: ids.ATTENDANCE, value: { optionId: "opt_worship" } }, { fieldId: ids.MEALS, value: { optionIds: ["opt_d1_worship"] } });
    if (kind.startsWith("partial:")) { const [, x, y] = kind.split(":"); a.push({ fieldId: ids.ATTENDANCE, value: { optionId: "opt_partial" } }, { fieldId: ids.ARRIVAL_SLOT, value: { optionId: x } }, { fieldId: ids.DEPARTURE_SLOT, value: { optionId: y } }); }
    const b = await api(c, "POST", `/api/v1/public/events/${eventId}/forms/${formId}/applications`, { pin: "730914", answers: a });
    people[name] = { ctx: c, id: b.participantId };
  }
  await apply("김하늘", 1, "94", "opt_male", "full");
  await apply("이도윤", 2, "95", "opt_male", "full");
  await apply("박서준", 3, "96", "opt_male", "partial:opt_d2_dinner:opt_d3_lunch");
  await apply("정집회", 4, "98", "opt_male", "worship");
  await apply("최예린", 5, "97", "opt_female", "full");
  await apply("한수아", 6, "99", "opt_female", "full");
  await apply("윤새벽", 7, "00", "opt_female", "partial:opt_d2_breakfast:opt_d3_lunch");
  await apply("오다은", 8, "01", "opt_female", "full");
  const pid = (n) => people[n].id;
  const g1 = (await api(op, "POST", `${ev}/groups`, { name: "1조" })).group;
  const g2 = (await api(op, "POST", `${ev}/groups`, { name: "2조" })).group;
  const mv = (ns, g) => ns.map((n) => ({ participantId: pid(n), fromGroupId: null, toGroupId: g.groupId }));
  await api(op, "POST", `${ev}/group-assignments`, { changes: [...mv(["김하늘", "이도윤", "박서준", "정집회"], g1), ...mv(["최예린", "한수아", "윤새벽", "오다은"], g2)] });
  let b = await api(op, "GET", `${ev}/group-board`);
  const ver = (g) => (b.groups.find((x) => x.groupId === g.groupId) ?? {}).version ?? 0;
  await api(op, "PUT", `${ev}/groups/${g1.groupId}/leaders`, { participantIds: [pid("김하늘")], expectedVersion: ver(g1) });
  b = await api(op, "GET", `${ev}/group-board`);
  await api(op, "POST", `${ev}/groups/publish`, { expectedBoardVersion: b.boardVersion, confirmUnassigned: true });
  const room = async (name, note) => (await api(op, "POST", `${ev}/rooms`, { name, locationNote: note, capacity: 4 })).room.roomId;
  const r301 = await room("301호", "본관 3층 왼쪽");
  const r302 = await room("302호", "본관 3층 오른쪽");
  const to = (ns, r) => ns.map((n) => ({ participantId: pid(n), fromRoomId: null, toRoomId: r }));
  await api(op, "POST", `${ev}/room-assignments`, { changes: [...to(["김하늘", "이도윤", "박서준"], r301), ...to(["최예린", "한수아", "윤새벽", "오다은"], r302)] });
  const rb = await api(op, "GET", `${ev}/room-board`);
  await api(op, "POST", `${ev}/rooms/publish`, { expectedBoardVersion: rb.boardVersion, confirmUnassigned: true, confirmNotLodging: true, notify: false });
  mark("준비(API)", `행사 ${eventId}, 신청 8명, 조 2개 공개, 방 2개 공개`);

  // ---- 현장 운영: 휴대폰 390 ----
  const pc = await ctx(phone);
  await api(pc, "POST", "/api/v1/operator/auth/login", { userId: OWNER });
  const fp = await pc.newPage();
  await fp.goto(`${APP}/events/${eventId}/field`);
  await fp.getByRole("button", { name: /김하늘 체크인$/ }).waitFor({ timeout: 30000 });
  await fp.waitForTimeout(800);
  mark("현장 390 요약", (await fp.locator(".event-field__summary, .event-field__arrivals").allInnerTexts()).join(" | ").replace(/\n/g, " "));
  mark("현장 390 거르기 칩", (await fp.locator(".event-field__filter").allInnerTexts()).join(" · "));
  mark("현장 390 식수 링크", String(await fp.getByRole("link", { name: "식수 현황 보기" }).isVisible()));
  await shot(fp, "20-field-390-top", false);
  await fp.getByRole("button", { name: /김하늘 체크인$/ }).click();
  const n1 = fp.getByText(/김하늘 님을 체크인했어요/).first();
  await n1.waitFor({ timeout: 15000 });
  mark("현장 390 수동 체크인 안내", (await n1.innerText()).replace(/\n/g, " "));
  await shot(fp, "21-field-390-checkin-notice", false);
  await fp.getByRole("button", { name: /정집회 체크인$/ }).click();
  const n2 = fp.getByText(/정집회 님을 체크인했어요/).first();
  await n2.waitFor({ timeout: 15000 });
  mark("현장 390 숙박 안 함 안내", (await n2.innerText()).replace(/\n/g, " "));
  await fp.waitForTimeout(600);
  for (const row of await fp.locator(".event-field__row").all()) mark("현장 390 줄", (await row.innerText()).replace(/\n/g, " / "));
  mark("현장 390 넘침", JSON.stringify(await overflow(fp)));
  await shot(fp, "22-field-390-roster");
  const r = fp.locator(".event-field__row", { hasText: "박서준" }).first();
  await r.scrollIntoViewIfNeeded();
  await r.screenshot({ path: `${OUT}/23-field-390-row-박서준.png` });
  await fp.locator(".event-field__filter", { hasText: "왔어야 함" }).click();
  await fp.waitForTimeout(1500);
  mark("현장 390 '왔어야 함' 거르기", (await fp.locator(".event-field__row .event-field__name").allInnerTexts()).join(", "));
  await shot(fp, "24-field-390-overdue-filter", false);

  // ---- 현장 운영: 데스크톱 1440 ----
  const fd = await op.newPage();
  await fd.goto(`${APP}/events/${eventId}/field`);
  await fd.locator(".event-field__row").first().waitFor({ timeout: 30000 });
  await fd.waitForTimeout(800);
  mark("현장 1440 거르기 칩", (await fd.locator(".event-field__filter").allInnerTexts()).join(" · "));
  mark("현장 1440 넘침", JSON.stringify(await overflow(fd)));
  await fd.locator(".event-field__row", { hasText: "윤새벽" }).locator(".event-field__row-main").click();
  await fd.waitForTimeout(500);
  await shot(fd, "25-field-1440-selected", false);
  await fd.getByRole("button", { name: /이도윤 체크인$/ }).first().click();
  const n3 = fd.getByText(/이도윤 님을 체크인했어요/).first();
  await n3.waitFor({ timeout: 15000 });
  mark("현장 1440 수동 체크인 안내", (await n3.innerText()).replace(/\n/g, " "));
  await shot(fd, "26-field-1440-checkin-notice", false);

  // ---- 3주차 화면을 새 셸에서 ----
  const pages = [
    ["meals", "식수 현황", "27-meals"],
    ["rooms", "숙소", "28-rooms-board"],
    ["groups", "조 편성", "29-groups"],
    ["participants", "참가 현황", "30-participants-table"],
  ];
  for (const [path, label, file] of pages) {
    for (const [name, page] of [["1440", fd], ["390", fp]]) {
      await page.goto(`${APP}/events/${eventId}/${path}`);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(1500);
      const o = await overflow(page);
      mark(`${label} ${name}`, `문서 가로 넘침 ${o.doc ? "있음" : "없음"}, 본문 폭 ${o.mainWidth}`);
      await shot(page, `${file}-${name}`, false);
    }
  }
  const roomCol = await fd.evaluate(() => [...document.querySelectorAll("th")].map((t) => t.innerText.trim()).filter((t) => /방/.test(t)));
  mark("참가 현황 표 방 열(1440)", roomCol.join(", ") || "보이지 않음");
  await fd.goto(`${APP}/events/${eventId}/groups`);
  await fd.waitForTimeout(1500);
  const sw = fd.getByRole("button", { name: /명단 숨기기|명단 보여 주기/ }).first();
  mark("조 편성 명단 공개 스위치(1440)", (await sw.isVisible().catch(() => false)) ? await sw.innerText() : "보이지 않음");

  // ---- 참가자: 조장 홈·일정 탭(시간표)·조원 현황 ----
  const lp = await people["김하늘"].ctx.newPage();
  await lp.goto(`${APP}/participate/${eventId}`);
  await lp.getByRole("region", { name: "숙소" }).getByText("301호").first().waitFor({ timeout: 40000 });
  await shot(lp, "31-participant-home-390");
  mark("참가자 홈 카드", (await lp.locator("section h2, section h3, [role=region]").allInnerTexts()).map((t) => t.split("\n")[0]).join(" · ").slice(0, 200));
  await lp.goto(`${APP}/participate/${eventId}/schedule`);
  await lp.waitForTimeout(2500);
  mark("참가자 일정 탭", (await lp.locator("main").innerText()).replace(/\n/g, " / ").slice(0, 200));
  await shot(lp, "32-participant-schedule-390");
  await lp.goto(`${APP}/participate/${eventId}/group`);
  await lp.getByText("이도윤").first().waitFor({ timeout: 30000 });
  await lp.waitForTimeout(800);
  mark("조장 조원 현황 방", (await lp.getByText(/방 30\d호/).allInnerTexts()).join(", "));
  await shot(lp, "33-leader-group-status-390");

  fs.writeFileSync(`${OUT}/click-log-main.txt`, log.join("\n") + "\n");
  await browser.close();
})().catch((e) => { console.error(e); fs.writeFileSync(`${OUT}/click-log-main.txt`, log.join("\n") + "\nFAILED: " + e.message + "\n"); process.exit(1); });
