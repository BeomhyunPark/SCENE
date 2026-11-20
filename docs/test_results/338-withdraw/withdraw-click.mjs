// Real click check for #338 (DEC-084) against a local backend (local profile) and Vite with
// VITE_API_MOCK=0. Setup (event, form, people, groups, check-in) goes through the HTTP API with
// the same sessions; the withdraw, the lists and the restore are clicked.
// Usage: node withdraw-click.mjs <outDir>
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const [outDir] = process.argv.slice(2);
const APP = "http://localhost:5173";
const OWNER = "00000000-0000-4000-8000-000000000001";
const PIN = "730914";
const log = [];
const note = (line) => { log.push(line); console.log(line); };
const sql = (q) => execFileSync("docker", ["exec", "scene-local-postgres-1", "psql", "-U", "scene", "-d", "scene", "-Atc", q]).toString().trim();

const browser = await chromium.launch();
const desktop = { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, locale: "ko-KR", timezoneId: "Asia/Seoul" };
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ko-KR", timezoneId: "Asia/Seoul" };

async function context(options) {
  const ctx = await browser.newContext(options);
  await ctx.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
  return ctx;
}
const H = { "X-XSRF-TOKEN": "dev-csrf" };
async function api(ctx, method, path, data) {
  const res = await ctx.request.fetch(`${APP}${path}`, { method, headers: H, data });
  const text = await res.text();
  if (res.status() >= 300) throw new Error(`${method} ${path} ${res.status()} ${text}`);
  return text ? JSON.parse(text) : null;
}

// ---- operator and event ----
const op = await context(desktop);
await api(op, "POST", "/api/v1/operator/auth/login", { userId: OWNER });
const spaces = await api(op, "GET", "/api/v1/operator/spaces");
const spaceId = (spaces.items ?? spaces)[0].spaceId;
const { eventId } = await api(op, "POST", `/api/v1/operator/spaces/${spaceId}/events`, { name: "취소 확인 수련회" });
sql(`UPDATE events SET start_date = '2027-01-22', end_date = '2027-01-24' WHERE id = '${eventId}'`);
const { formId } = await api(op, "POST", `/api/v1/operator/events/${eventId}/forms`, {});
await api(op, "PUT", `/api/v1/operator/events/${eventId}/forms/${formId}/setup`, {
  gender: true, middleGroup: false, cell: false,
  attendance: { partial: true, worshipOnly: true, mode: "SLOTS" },
  schedule: [
    { breakfast: false, lunch: false, dinner: true, worship: true },
    { breakfast: true, lunch: true, dinner: true, worship: true },
    { breakfast: true, lunch: false, dinner: false, worship: false },
  ],
  transport: { groupBus: true, worshipShuttle: false, car: true, publicTransit: true, support: false },
});
const lifecycle = await api(op, "GET", `/api/v1/operator/events/${eventId}/lifecycle`);
await api(op, "POST", `/api/v1/operator/events/${eventId}/activate`, { expectedLifecycleVersion: lifecycle.lifecycleVersion ?? 0 });
await api(op, "PATCH", `/api/v1/operator/events/${eventId}/forms/${formId}`, { acceptingApplications: true });
const form = await api(op, "GET", `/api/v1/operator/events/${eventId}/forms/${formId}`);
const field = Object.fromEntries(form.fields.map((f) => [f.presetKey ?? f.systemKey, f.fieldId]));
note(`event ${eventId} form ${formId} open`);

// ---- three people apply, each from an own phone context ----
async function apply(name, n, partial) {
  const ctx = await context(phone);
  const values = partial
    ? { GENDER: { optionId: "opt_male" }, ATTENDANCE: { optionId: "opt_partial" }, ARRIVAL_AT: { dateTime: "2027-01-23T11:00" }, DEPARTURE_AT: { dateTime: "2027-01-24T09:00" }, LODGING: { optionIds: ["opt_n2"] }, MEALS: { optionIds: ["opt_d2_lunch", "opt_d2_dinner", "opt_d2_worship"] }, TRANSPORT_IN: { optionId: "opt_car" }, CARPOOL_OFFER: { value: false } }
    : { GENDER: { optionId: "opt_female" }, ATTENDANCE: { optionId: "opt_full" }, TRANSPORT_IN: { optionId: "opt_group" }, TRANSPORT_OUT: { optionId: "opt_group" } };
  const answers = [
    { fieldId: field.NAME, text: name },
    { fieldId: field.PHONE, text: `010-5151-000${n}` },
    { fieldId: field.COHORT, text: `9${n}` },
    ...Object.entries(values).map(([key, value]) => ({ fieldId: field[key], value })),
  ];
  if (field.CONSENT) answers.push({ fieldId: field.CONSENT, value: { value: true } });
  const body = await api(ctx, "POST", `/api/v1/public/events/${eventId}/forms/${formId}/applications`, { pin: PIN, answers });
  return { ctx, ...body };
}
const garam = await apply("김가람", 1, false);
const narae = await apply("이나래", 2, true);
const dasom = await apply("박다솜", 3, false);

// ---- groups, publication and check-in ----
const g1 = (await api(op, "POST", `/api/v1/operator/events/${eventId}/groups`, { name: "1조" })).group.groupId;
await api(op, "POST", `/api/v1/operator/events/${eventId}/group-assignments`, {
  changes: [garam, narae, dasom].map((p) => ({ participantId: p.participantId, fromGroupId: null, toGroupId: g1 })),
});
await api(op, "PUT", `/api/v1/operator/events/${eventId}/groups/${g1}/leaders`, { expectedVersion: 0, participantIds: [narae.participantId] });
let board = await api(op, "GET", `/api/v1/operator/events/${eventId}/group-board`);
await api(op, "POST", `/api/v1/operator/events/${eventId}/groups/publish`, { expectedBoardVersion: board.boardVersion, confirmUnassigned: true });
await op.request.fetch(`${APP}/api/v1/operator/events/${eventId}/check-ins`, { method: "POST", headers: { ...H, "Idempotency-Key": "click-1" }, data: { mode: "MANUAL", participantId: narae.participantId } });

async function numbers(label) {
  const s = await api(op, "GET", `/api/v1/operator/events/${eventId}/applications/summary`);
  const night = s.lodging.nights.find((n) => n.optionId === "opt_n2").count;
  const car = s.transport.in.options.find((o) => o.optionId === "opt_car").count;
  const c = await api(op, "GET", `/api/v1/operator/events/${eventId}/check-ins/summary`);
  const roster = await api(op, "GET", `/api/v1/operator/events/${eventId}/check-in-roster`);
  const b = await api(op, "GET", `/api/v1/operator/events/${eventId}/group-board`);
  const pub = await api(op, "GET", `/api/v1/operator/events/${eventId}/groups/published`);
  const t = await api(op, "GET", `/api/v1/operator/events/${eventId}/applications/table`);
  const csv = await op.request.fetch(`${APP}/api/v1/operator/events/${eventId}/applications/export`, { method: "POST", headers: H });
  const mine = await garam.ctx.request.get(`${APP}/api/v1/participant/group`);
  const leaders = (await mine.json()).group?.leaders?.map((l) => l.name).join("") || "없음";
  note(`${label}: 집계 ${s.total}명 · 2일 밤 ${night} · 자차 ${car} | 체크인 ${c.checkedIn}/${c.total} · 명단 ${roster.page.totalItems} | 편성판 ${b.participants.length}명 · 취소 ${b.withdrawn.length} | 공개본 1조 ${pub.groups[0].members.length}명 조장 ${pub.groups[0].leaders.length} · 가람이 보는 조장 ${leaders} | 표 ${t.rows.length} · 취소 ${t.withdrawn.length} | CSV ${csv.headers()["x-export-count"]}`);
}
await numbers("취소 전");

// ---- the operator clicks ----
const page = await op.newPage();
await page.goto(`${APP}/events/${eventId}/participants`);
await page.getByRole("button", { name: "이나래 운영 정보 수정" }).waitFor();
await page.screenshot({ path: `${outDir}/01-table-before.png` });

const mobile = await context(phone);
await mobile.request.post(`${APP}/api/v1/operator/auth/login`, { headers: H, data: { userId: OWNER } });
const m = await mobile.newPage();
await m.goto(`${APP}/events/${eventId}/participants`);
const editButton = m.getByRole("button", { name: "이나래 운영 정보 수정" });
await editButton.waitFor();
// The 수정 column is at the right end of the sheet; on a phone the sheet scrolls sideways.
await editButton.evaluate((el) => {
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowX) && node.scrollWidth > node.clientWidth) node.scrollLeft = node.scrollWidth;
  }
});
await m.evaluate(() => window.scrollBy(0, 360));
await m.waitForTimeout(300);
await editButton.click();
const drawer = m.getByRole("dialog", { name: "현재 운영 정보 수정" });
await drawer.getByRole("button", { name: "신청 취소" }).waitFor();
await m.waitForTimeout(500);
await m.screenshot({ path: `${outDir}/02-phone-drawer-status.png` });
await drawer.getByRole("button", { name: "신청 취소" }).click();
const confirm = m.getByRole("dialog", { name: "이나래님의 신청을 취소할까요?" });
await confirm.getByLabel("취소 사유 (선택)").fill("가족 사정으로 참석 못 함");
await m.screenshot({ path: `${outDir}/03-phone-withdraw-confirm.png` });
note(`03 확인 창: ${(await confirm.locator(".withdraw__impact").innerText()).replace(/\n+/g, " / ")}`);
await confirm.getByRole("button", { name: "신청 취소하기" }).click();
await m.getByText(/이나래님의 신청을 취소했어요/).waitFor();
await m.screenshot({ path: `${outDir}/04-phone-after-withdraw.png` });
note(`04 휴대폰: 서랍 닫힘, 안내 "${await m.locator(".withdrawn__notice").innerText()}"`);

await numbers("취소 후");
const status = sql(`SELECT status FROM applications WHERE participant_id = '${narae.participantId}'`);
const logRow = sql(`SELECT cause || ':' || leader_before FROM group_assignment_logs WHERE participant_id = '${narae.participantId}' AND cause = 'WITHDRAWN'`);
const sessions = sql(`SELECT count(*) FROM participant_sessions WHERE participant_id = '${narae.participantId}'`);
const audit = sql(`SELECT detail FROM audit_logs WHERE event_id = '${eventId}' AND action = 'APPLICATION_WITHDRAWN'`);
note(`   DB: 신청 ${status}, 조 이력 ${logRow}, 세션 ${sessions}, audit ${audit}`);

await page.reload();
await page.getByRole("button", { name: /취소 1/ }).click();
await page.getByRole("region", { name: "취소된 신청 1명" }).waitFor();
await page.screenshot({ path: `${outDir}/05-table-withdrawn-list.png` });
note(`05 표: 김가람·박다솜만, "취소 1" → ${(await page.locator(".withdrawn__item").innerText()).replace(/\n+/g, " / ")}`);

await page.goto(`${APP}/events/${eventId}/participants/summary`);
await page.getByText("신청 집계").first().waitFor();
await page.waitForTimeout(800);
await page.screenshot({ path: `${outDir}/06-summary-after.png`, fullPage: true });
await page.goto(`${APP}/events/${eventId}/groups`);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/07-groups-after.png`, fullPage: true });
await page.goto(`${APP}/events/${eventId}/field`);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/08-field-after.png` });

// ---- the participant ----
const p = await narae.ctx.newPage();
await p.goto(`${APP}/participate/${eventId}`);
await p.locator("#enter-name").waitFor();
note(`09 이나래 휴대폰: 남아 있던 쿠키로 다시 열면 들어오기 화면`);
await p.locator("#enter-name").fill("이나래");
await p.locator("#enter-phone").fill("010-5151-0002");
await p.locator("#enter-pin").fill(PIN);
await p.getByRole("button", { name: /들어가기|들어오기/ }).click();
await p.getByRole("alert").waitFor();
note(`   들어오기: ${await p.getByRole("alert").innerText()}`);
await p.screenshot({ path: `${outDir}/09-participant-refused.png` });

await page.goto(`${APP}/events/${eventId}/participants/${narae.applicationId}`);
await page.getByRole("heading", { name: "취소된 신청" }).waitFor();
await page.screenshot({ path: `${outDir}/10-detail-withdrawn.png` });

// ---- restore ----
await page.goto(`${APP}/events/${eventId}/participants`);
await page.getByRole("button", { name: /취소 1/ }).click();
await page.getByRole("region", { name: "취소된 신청 1명" }).getByRole("button", { name: "되돌리기" }).click();
const restore = page.getByRole("dialog", { name: "이나래님의 신청을 되돌릴까요?" });
await restore.waitFor();
await page.screenshot({ path: `${outDir}/11-restore-confirm.png` });
await restore.getByRole("button", { name: "되돌리기" }).click();
await page.getByText(/이나래님의 신청을 되돌렸어요/).waitFor();
await page.getByRole("button", { name: "이나래 운영 정보 수정" }).waitFor();
await page.screenshot({ path: `${outDir}/12-table-after-restore.png` });
note(`12 되돌리기: ${await page.locator(".withdrawn__done").innerText()}`);
await numbers("되돌린 후");
const mineAfter = await (await narae.ctx.request.get(`${APP}/api/v1/participant/group`)).status();
note(`   (공개본은 그 공개 뒤 취소된 사람을 빼므로 이나래는 공개본에서 미배정, 가람이 보는 조장은 없음이어야 한다. 이나래의 옛 쿠키: ${mineAfter})`);
const groupNow = await api(op, "GET", `/api/v1/operator/events/${eventId}/group-board`);
note(`   이나래 조: ${groupNow.participants.find((x) => x.participantId === narae.participantId).groupId ?? "미배정"}`);
await p.locator("#enter-pin").fill(PIN);
await p.getByRole("button", { name: /들어가기|들어오기/ }).click();
await p.waitForTimeout(1500);
await p.screenshot({ path: `${outDir}/13-participant-back.png` });
note(`13 이나래 들어오기: ${(await p.locator("main, body").first().innerText()).split("\n").slice(0, 3).join(" / ")}`);

await browser.close();
console.log("LOG_JSON " + JSON.stringify(log));
