// Real click check for G4 (#459) against a local backend (local profile, G2 server) and Vite with
// VITE_API_MOCK=0. Setup (event, form, people, rooms, assignments, publish, scope) goes through the
// operator HTTP API; the participant phones (390px) open home and wait for their own `updates` poll.
// Usage: node rooms-click.mjs <outDir>
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const [outDir] = process.argv.slice(2);
const APP = "http://localhost:5173";
const OWNER = "00000000-0000-4000-8000-000000000001";
const PIN = "730914";
const log = [];
const note = (line) => { log.push(line); console.log(line); };

const browser = await chromium.launch();
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
const shot = (page, name) => page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });

// ---- operator: event, form, people ----
const op = await context(phone);
await api(op, "POST", "/api/v1/operator/auth/login", { userId: OWNER });
const spaces = await api(op, "GET", "/api/v1/operator/spaces");
const spaceId = (spaces.items ?? spaces)[0].spaceId;
const { eventId } = await api(op, "POST", `/api/v1/operator/spaces/${spaceId}/events`, { name: "숙소 확인 수련회", eventType: "RETREAT", startDate: "2027-01-22", endDate: "2027-01-24", place: "양평 수양관" });
const { formId } = await api(op, "POST", `/api/v1/operator/events/${eventId}/forms`, {});
const lifecycle = await api(op, "GET", `/api/v1/operator/events/${eventId}/lifecycle`);
await api(op, "POST", `/api/v1/operator/events/${eventId}/activate`, { expectedLifecycleVersion: lifecycle.lifecycleVersion ?? 0 });
await api(op, "PATCH", `/api/v1/operator/events/${eventId}/forms/${formId}`, { acceptingApplications: true });
const form = await api(op, "GET", `/api/v1/operator/events/${eventId}/forms/${formId}`);
const fields = Object.fromEntries(form.fields.map((f) => [f.presetKey ?? f.systemKey ?? f.fieldId, f]));
note(`form fields: ${Object.keys(fields).join(", ")}`);
const genderField = form.fields.find((f) => (f.presetKey ?? f.systemKey) === "GENDER");
const genderOptions = genderField?.options ?? genderField?.config?.options ?? [];

async function apply(name, n, gender) {
  const ctx = await context(phone);
  const answers = [
    { fieldId: fields.NAME.fieldId, text: name },
    { fieldId: fields.PHONE.fieldId, text: `010-5959-000${n}` },
  ];
  if (fields.COHORT) answers.push({ fieldId: fields.COHORT.fieldId, text: `9${n}` });
  if (fields.CONSENT) answers.push({ fieldId: fields.CONSENT.fieldId, value: { value: true } });
  if (genderField && gender !== undefined && genderOptions[gender]) {
    answers.push({ fieldId: genderField.fieldId, optionId: genderOptions[gender].optionId ?? genderOptions[gender].id });
  }
  let body;
  try {
    body = await api(ctx, "POST", `/api/v1/public/events/${eventId}/forms/${formId}/applications`, { pin: PIN, answers });
  } catch (error) {
    note(`신청 ${name} 성별 답 포함 실패 → 성별 없이 다시: ${String(error).slice(0, 160)}`);
    body = await api(ctx, "POST", `/api/v1/public/events/${eventId}/forms/${formId}/applications`, { pin: PIN, answers: answers.filter((a) => a.fieldId !== genderField?.fieldId) });
  }
  return { ctx, name, ...body };
}
const people = [];
for (const [i, name] of ["김가람", "박나래", "이다온", "최라온", "정마루", "한바다", "윤새벽"].entries()) people.push(await apply(name, i + 1, 0));
const [garam, narae, daon, raon] = people;

// ---- garam's phone opens home before anything is published ----
const page = await garam.ctx.newPage();
await page.goto(`${APP}/participate/${eventId}`);
const card = page.getByRole("region", { name: "숙소" });
await card.getByText("숙소가 정해지면 여기에 보여요.").waitFor();
await shot(page, "01-home-not-published");
note("공개 전: 홈 숙소 카드 \"숙소가 정해지면 여기에 보여요.\"");
let roomReads = 0;
let scheduleReads = 0;
page.on("request", (request) => {
  const path = new URL(request.url()).pathname;
  if (path === "/api/v1/participant/rooms") roomReads += 1;
  if (path === "/api/v1/participant/schedule") scheduleReads += 1;
});

// ---- operator: rooms, assignments (working copy only) ----
const r301 = (await api(op, "POST", `/api/v1/operator/events/${eventId}/rooms`, { name: "301호", locationNote: "본관 3층 계단 옆", capacity: 6 })).room.roomId;
const r302 = (await api(op, "POST", `/api/v1/operator/events/${eventId}/rooms`, { name: "302호", locationNote: "본관 3층 끝", capacity: 4 })).room.roomId;
await api(op, "POST", `/api/v1/operator/events/${eventId}/rooms`, { name: "303호", capacity: 4 });
const inRoom = (list, roomId) => list.map((p) => ({ participantId: p.participantId, fromRoomId: null, toRoomId: roomId }));
await api(op, "POST", `/api/v1/operator/events/${eventId}/room-assignments`, {
  changes: [...inRoom(people.slice(0, 3), r301), ...inRoom(people.slice(4, 6), r302)],
});
await page.waitForTimeout(32_000);
note(`작업본 저장 뒤 32초: 카드 "${(await card.innerText()).replace(/\n+/g, " / ")}" · rooms 다시 읽기 ${roomReads}번`);

// ---- publish → home shows room and roommates on its own poll ----
const board = await api(op, "GET", `/api/v1/operator/events/${eventId}/room-board`);
const pub = await api(op, "POST", `/api/v1/operator/events/${eventId}/rooms/publish`, { expectedBoardVersion: board.boardVersion, confirmUnassigned: true });
const published = Date.now();
note(`공개: ${pub.result} (7명 중 5명 배정, 미배정 확인 confirmUnassigned)`);
await card.getByText("301호").waitFor({ timeout: 45_000 });
note(`공개 뒤 홈 숙소 카드에 방이 보이기까지 ${((Date.now() - published) / 1000).toFixed(1)}초 (화면이 스스로 updates를 확인)`);
note(`카드: ${(await card.innerText()).replace(/\n+/g, " / ")}`);
note(`그동안 다시 읽은 횟수: rooms ${roomReads}번, schedule ${scheduleReads}번`);
await shot(page, "02-home-published");

// ---- 자세히 → 숙소 screen; 전체 방 배정표 ----
await card.getByRole("link", { name: "숙소 자세히 보기" }).click();
await page.getByRole("heading", { name: "숙소", level: 1 }).waitFor();
note(`숙소 화면 주소 ${new URL(page.url()).pathname} · 현재 탭 "${await page.locator('nav [aria-current="page"]').innerText()}" · 탭 ${await page.getByRole("navigation", { name: "참가자 메뉴" }).getByRole("link").count()}개`);
await shot(page, "03-rooms-screen-all");
const text = await page.locator("main").innerText();
note(`화면에 전화번호 보임 ${/010-/.test(text)} · 참가자 id 보임 ${people.some((p) => text.includes(p.participantId))} · 방 id 보임 ${[r301, r302].some((id) => text.includes(id))}`);

// ---- raon (unassigned) ----
const raonPage = await raon.ctx.newPage();
await raonPage.goto(`${APP}/participate/${eventId}`);
await raonPage.getByRole("region", { name: "숙소" }).getByText(/숙소를 정하고 있어요/).waitFor();
await shot(raonPage, "04-home-unassigned");
note(`미배정 최라온 카드: ${(await raonPage.getByRole("region", { name: "숙소" }).innerText()).replace(/\n+/g, " / ")}`);

// ---- scope ROOMMATES, then MY_ROOM ----
const settings = await api(op, "GET", `/api/v1/operator/events/${eventId}/participant-settings`);
const s1 = await api(op, "PUT", `/api/v1/operator/events/${eventId}/participant-settings`, { roomRosterScope: "ROOMMATES", expectedVersion: settings.version });
await page.goto(`${APP}/participate/${eventId}`);
await page.getByRole("region", { name: "숙소" }).getByText("301호").waitFor();
await page.getByRole("region", { name: "숙소" }).getByRole("link", { name: "전체 방 배정표" }).waitFor({ state: "detached", timeout: 1000 }).catch(() => null);
await page.getByRole("region", { name: "숙소" }).getByRole("link", { name: "숙소 자세히 보기" }).click();
await page.getByRole("heading", { name: "숙소", level: 1 }).waitFor();
note(`ROOMMATES(새로 연 화면): 전체 방 배정표 ${await page.getByRole("region", { name: /전체 방 배정표/ }).count()}개`);
await shot(page, "05-rooms-screen-roommates");
await api(op, "PUT", `/api/v1/operator/events/${eventId}/participant-settings`, { roomRosterScope: "MY_ROOM", expectedVersion: s1.version });
const narrowed = Date.now();
await page.getByRole("list", { name: "같은 방 사람" }).waitFor({ state: "detached", timeout: 45_000 });
note(`MY_ROOM으로 바꾼 뒤 열어 둔 숙소 화면에서 같은 방 사람이 사라지기까지 ${((Date.now() - narrowed) / 1000).toFixed(1)}초`);
await shot(page, "06-rooms-screen-my-room");

// ---- notification row for ROOM_PUBLISHED (no participant notification screen yet, B5) ----
const notes = await api(garam.ctx, "GET", "/api/v1/participant/notifications");
const rp = (notes.items ?? []).filter((n) => n.kind === "ROOM_PUBLISHED");
note(`참가자 알림 ROOM_PUBLISHED ${rp.length}건: ${rp.map((n) => `${n.title} / ${n.body} / target ${n.target?.type}`).join(" | ")}`);

writeFileSync(`${outDir}/click-log.txt`, `${log.join("\n")}\n`);
await browser.close();
