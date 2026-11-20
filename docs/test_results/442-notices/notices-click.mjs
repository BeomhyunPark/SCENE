// Real click check for D3 (#442) and D4 (#443) against a local backend (local profile) and Vite with
// VITE_API_MOCK=0. Setup (event, form, people, groups) goes through the HTTP API; writing, publishing,
// editing, pinning and archiving notices are clicked on a 390px phone and on a desktop, and the
// participant phones wait for their own `updates` poll (nothing reloads them by hand).
// Usage: node notices-click.mjs <outDir>
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const [outDir] = process.argv.slice(2);
const APP = "http://localhost:5173";
const OWNER = "00000000-0000-4000-8000-000000000001";
const STAFF = "00000000-0000-4000-8000-000000000003";
const PIN = "730914";
const log = [];
const note = (line) => { log.push(line); console.log(line); };

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
const shot = (page, name) => page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });

// ---- operator, event, people, groups ----
const op = await context(desktop);
await api(op, "POST", "/api/v1/operator/auth/login", { userId: OWNER });
const spaces = await api(op, "GET", "/api/v1/operator/spaces");
const spaceId = (spaces.items ?? spaces)[0].spaceId;
const { eventId } = await api(op, "POST", `/api/v1/operator/spaces/${spaceId}/events`, { name: "공지 확인 수련회", eventType: "RETREAT" });
await api(op, "POST", `/api/v1/operator/events/${eventId}/operators`, { userId: STAFF, role: "STAFF" });
const { formId } = await api(op, "POST", `/api/v1/operator/events/${eventId}/forms`, {});
const lifecycle = await api(op, "GET", `/api/v1/operator/events/${eventId}/lifecycle`);
await api(op, "POST", `/api/v1/operator/events/${eventId}/activate`, { expectedLifecycleVersion: lifecycle.lifecycleVersion ?? 0 });
await api(op, "PATCH", `/api/v1/operator/events/${eventId}/forms/${formId}`, { acceptingApplications: true });
const form = await api(op, "GET", `/api/v1/operator/events/${eventId}/forms/${formId}`);
const field = Object.fromEntries(form.fields.map((f) => [f.presetKey ?? f.systemKey, f.fieldId]));

async function apply(name, n) {
  const ctx = await context(phone);
  const answers = [
    { fieldId: field.NAME, text: name },
    { fieldId: field.PHONE, text: `010-4242-000${n}` },
  ];
  if (field.COHORT) answers.push({ fieldId: field.COHORT, text: `9${n}` });
  if (field.CONSENT) answers.push({ fieldId: field.CONSENT, value: { value: true } });
  const body = await api(ctx, "POST", `/api/v1/public/events/${eventId}/forms/${formId}/applications`, { pin: PIN, answers });
  return { ctx, name, ...body };
}
const garam = await apply("김가람", 1); // member
const narae = await apply("이나래", 2); // leader
const g1 = (await api(op, "POST", `/api/v1/operator/events/${eventId}/groups`, { name: "1조" })).group.groupId;
await api(op, "POST", `/api/v1/operator/events/${eventId}/group-assignments`, {
  changes: [garam, narae].map((p) => ({ participantId: p.participantId, fromGroupId: null, toGroupId: g1 })),
});
await api(op, "PUT", `/api/v1/operator/events/${eventId}/groups/${g1}/leaders`, { expectedVersion: 0, participantIds: [narae.participantId] });
const board = await api(op, "GET", `/api/v1/operator/events/${eventId}/group-board`);
await api(op, "POST", `/api/v1/operator/events/${eventId}/groups/publish`, { expectedBoardVersion: board.boardVersion, confirmUnassigned: true });
note(`setup: event ${eventId}, 김가람(조원)·이나래(조장), STAFF 운영 멤버`);

// ---- participant phones open home and leave it open ----
const garamPage = await garam.ctx.newPage();
await garamPage.goto(`${APP}/participate/${eventId}`);
await garamPage.getByRole("region", { name: "최신 공지" }).getByText("공지가 올라오면 여기에 보여요.").waitFor();
await shot(garamPage, "01-participant-home-empty");
const naraePage = await narae.ctx.newPage();
await naraePage.goto(`${APP}/participate/${eventId}/notices`);
await naraePage.getByRole("heading", { name: "공지", level: 1 }).waitFor();
let noticeReads = 0;
garamPage.on("request", (request) => {
  if (new URL(request.url()).pathname.startsWith("/api/v1/participant/notices")) noticeReads += 1;
});

// ---- operator phone: 전체 메뉴 → 공지 → 공지 쓰기 → 발행 ----
const mobile = await context(phone);
await mobile.request.post(`${APP}/api/v1/operator/auth/login`, { headers: H, data: { userId: OWNER } });
const m = await mobile.newPage();
await m.goto(`${APP}/events/${eventId}`);
await m.getByRole("button", { name: "전체 메뉴" }).click();
const drawer = m.getByRole("dialog", { name: "운영 메뉴" });
await drawer.getByRole("link", { name: "공지", exact: true }).waitFor();
await shot(m, "02-phone-menu-notices");
await drawer.getByRole("link", { name: "공지", exact: true }).click();
await m.getByRole("button", { name: "공지 쓰기" }).waitFor();
await shot(m, "03-phone-list-empty");

let taps = 0;
const tap = async (locator) => { taps += 1; await locator.click(); };
await tap(m.getByRole("button", { name: "공지 쓰기" }));
await m.getByLabel("제목").fill("내일 아침 집회 장소 변경");
await m.getByLabel("내용").fill(
  "소강당이 아니라 대강당입니다.\n7시 50분까지 모여 주세요.\n<script>alert(1)</script> <b>굵게</b>\n지도: https://example.com/map?x=1\njavascript:alert(2)",
);
await m.getByLabel("중요").check();
await shot(m, "04-phone-editor-filled");
await tap(m.getByRole("button", { name: "발행" }));
const published = Date.now();
await m.getByRole("status").filter({ hasText: "발행했어요" }).waitFor();
note(`발행: 글을 쓴 뒤 누른 횟수 ${taps}번(공지 쓰기 → 발행; 입력칸 누르기와 중요 체크는 뺐다) · 안내 "${await m.getByRole("status").innerText()}"`);
await shot(m, "05-phone-published");

// ---- participant home picks it up on its own poll ----
const card = garamPage.getByRole("region", { name: "최신 공지" });
await card.getByText("내일 아침 집회 장소 변경").waitFor({ timeout: 45_000 });
note(`참가자 홈에 뜨기까지 ${((Date.now() - published) / 1000).toFixed(1)}초 (화면이 스스로 updates를 확인, 주기 25초 ±20%)`);
note(`참가자 홈 카드 표시: ${(await card.innerText()).replace(/\n+/g, " / ")}`);
await shot(garamPage, "06-participant-home-new");
const updatesBefore = await api(garam.ctx, "GET", "/api/v1/participant/updates");

// ---- participant opens it: plain text, https link only, read ----
await card.getByRole("link", { name: /내일 아침 집회 장소 변경/ }).click();
await garamPage.getByRole("heading", { name: "내일 아침 집회 장소 변경", level: 1 }).waitFor();
const body = garamPage.locator(".notice-detail__body");
const links = await body.locator("a").evaluateAll((as) => as.map((a) => `${a.getAttribute("href")} target=${a.target} rel=${a.rel}`));
note(`상세 본문 글자: script 태그 ${await body.locator("script").count()}개, b 태그 ${await body.locator("b").count()}개, "<script>" 글자 보임 ${(await body.innerText()).includes("<script>alert(1)</script>")}, 링크 ${JSON.stringify(links)}`);
await shot(garamPage, "07-participant-detail");
await garamPage.waitForTimeout(800);
const updatesAfter = await api(garam.ctx, "GET", "/api/v1/participant/updates");
note(`읽음: updates.notifications 열기 전 ${JSON.stringify(updatesBefore.notifications)} → 연 뒤 ${JSON.stringify(updatesAfter.notifications)}`);
await garamPage.getByRole("link", { name: "공지 목록으로" }).click();
const row = garamPage.getByRole("link", { name: /내일 아침 집회 장소 변경/ });
await row.waitFor();
note(`목록의 새 공지 표시: ${(await row.innerText()).includes("새 공지") ? "남음" : "사라짐"}`);
await shot(garamPage, "08-participant-list-read");

// ---- operator edits on the phone → 수정됨 ----
await m.getByRole("button", { name: "고치기" }).click();
await m.getByLabel("제목").fill("내일 아침 집회 장소 변경 (정정)");
await m.getByText("다시 알림").waitFor();
await shot(m, "09-phone-edit-renotify");
await m.getByRole("button", { name: "저장" }).click();
const edited = Date.now();
await m.getByRole("status").filter({ hasText: "저장했어요" }).waitFor();
await garamPage.getByText("내일 아침 집회 장소 변경 (정정)").waitFor({ timeout: 45_000 });
const editedRow = garamPage.getByRole("link", { name: /정정/ });
note(`수정 반영 ${((Date.now() - edited) / 1000).toFixed(1)}초 · 행 "${(await editedRow.innerText()).replace(/\n+/g, " / ")}"`);
await shot(garamPage, "10-participant-edited");

// ---- desktop: leaders notice and staff notice ----
const d = await op.newPage();
await d.goto(`${APP}/events/${eventId}/notices/new`);
await d.getByLabel("제목").fill("조장 모임 9시");
await d.getByLabel("내용").fill("소강당 앞에서 모여요.");
await d.getByLabel("조장").check();
note(`조장 안내: "${await d.locator(".notice-form__audience .notice-form__hint").innerText()}"`);
await shot(d, "11-desktop-editor-leaders");
await d.getByRole("button", { name: "발행" }).click();
await d.getByRole("status").filter({ hasText: "발행했어요" }).waitFor();
note(`조장 공지 발행: "${await d.getByRole("status").innerText()}"`);

await d.goto(`${APP}/events/${eventId}/notices/new`);
await d.getByLabel("제목").fill("운영진 회의 22시");
await d.getByLabel("내용").fill("본부실에서 내일 동선을 정해요.");
await d.getByLabel("운영진").check();
await d.getByRole("button", { name: "발행" }).click();
await d.getByRole("status").filter({ hasText: "발행했어요" }).waitFor();
note(`운영진 공지 발행: "${await d.getByRole("status").innerText()}"`);

await naraePage.getByText("조장 모임 9시").waitFor({ timeout: 45_000 });
await naraePage.waitForTimeout(500);
const naraeList = await naraePage.locator(".notices__rows").innerText();
note(`조장(이나래) 목록: ${naraeList.replace(/\n+/g, " / ")}`);
await shot(naraePage, "12-leader-list");
const garamList = await api(garam.ctx, "GET", "/api/v1/participant/notices");
const naraeApi = await api(narae.ctx, "GET", "/api/v1/participant/notices");
note(`조원(김가람) 목록: ${garamList.items.map((i) => i.title).join(", ")} · 조장 목록: ${naraeApi.items.map((i) => `${i.title}${i.leadersOnly ? "(조장)" : ""}`).join(", ")}`);
await garamPage.waitForTimeout(31_000);
note(`조원 화면에 조장·운영진 공지: ${(await garamPage.locator("body").innerText()).match(/조장 모임|운영진 회의/) ? "보임" : "없음"}`);
await shot(garamPage, "13-member-list");

await d.goto(`${APP}/events/${eventId}`);
const staffCard = d.getByRole("region", { name: "운영진 공지" });
await staffCard.getByText("운영진 회의 22시").waitFor();
note(`운영자 행사 홈 운영진 공지 카드: ${(await staffCard.innerText()).replace(/\n+/g, " / ")}`);
await shot(d, "14-desktop-event-home-staff-card");
const staffCtx = await context(phone);
await staffCtx.request.post(`${APP}/api/v1/operator/auth/login`, { headers: H, data: { userId: STAFF } });
const s = await staffCtx.newPage();
await s.goto(`${APP}/events/${eventId}`);
await s.getByRole("region", { name: "운영진 공지" }).getByText("운영진 회의 22시").waitFor();
await shot(s, "15-phone-staff-event-home");
const staffUpdates = await api(staffCtx, "GET", `/api/v1/operator/events/${eventId}/updates`);
note(`STAFF 운영자 updates: notices ${staffUpdates.notices}, 알림 ${JSON.stringify(staffUpdates.notifications)}`);
await s.goto(`${APP}/events/${eventId}/notifications`);
const staffAlert = s.getByRole("list", { name: "알림 목록" }).getByRole("link", { name: /운영진 공지/ });
await staffAlert.waitFor();
await shot(s, "15b-phone-staff-notification");
await staffAlert.click();
await s.getByRole("heading", { name: "운영진 회의 22시" }).waitFor();
note(`STAFF 알림 목록의 운영진 공지 알림 → ${new URL(s.url()).pathname.replace(eventId, "{eventId}").replace(/[0-9a-f-]{36}$/, "{noticeId}")}`);
await s.goto(`${APP}/events/${eventId}/notices`);
await s.getByText("공지를 쓸 권한이 없어 읽기만 할 수 있어요.").waitFor();
note(`STAFF 목록: 공지 쓰기 버튼 ${await s.getByRole("button", { name: "공지 쓰기" }).count()}개`);
await shot(s, "16-phone-staff-readonly");

// ---- pin limit and list ----
for (const title of ["고정 하나", "고정 둘", "고정 셋"]) {
  await api(op, "POST", `/api/v1/operator/events/${eventId}/notices`, { title, body: "고정", audience: [{ type: "ALL" }], pinned: true, publish: true });
}
await d.goto(`${APP}/events/${eventId}/notices`);
await d.getByRole("link", { name: /정정/ }).click();
await d.getByRole("button", { name: "고정", exact: true }).click();
const alert = d.getByRole("alert");
await alert.waitFor();
await alert.getByRole("link").first().waitFor();
note(`고정 4개째: ${(await alert.innerText()).replace(/\n+/g, " / ")}`);
await shot(d, "17-desktop-pin-limit");
await d.goto(`${APP}/events/${eventId}/notices`);
await d.getByText("고정 3/3").waitFor();
await shot(d, "18-desktop-list");
await m.goto(`${APP}/events/${eventId}/notices`);
await m.getByText("고정 3/3").waitFor();
await shot(m, "19-phone-list");

// ---- archive → gone for participants ----
await d.goto(`${APP}/events/${eventId}/notices`);
await d.getByRole("link", { name: /정정/ }).click();
await d.getByRole("button", { name: "보관", exact: true }).click();
await d.getByRole("dialog").getByRole("button", { name: "보관" }).click();
const archived = Date.now();
await d.getByRole("status").filter({ hasText: "보관했어요" }).waitFor();
await shot(d, "20-desktop-archived");
await garamPage.getByText("내일 아침 집회 장소 변경 (정정)").waitFor({ state: "detached", timeout: 45_000 });
note(`보관 뒤 참가자 목록에서 사라지기까지 ${((Date.now() - archived) / 1000).toFixed(1)}초`);
await shot(garamPage, "21-participant-after-archive");

note(`참가자(김가람) 화면이 공지 경로를 부른 수: ${noticeReads} (처음·발행·수정·조장 공지 발행·고정·보관 때 updates.notices 신호, 상세 열기)`);
writeFileSync(`${outDir}/click-log.txt`, `${log.join("\n")}\n`);
await browser.close();
