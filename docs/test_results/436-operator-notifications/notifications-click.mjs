// Real click check for #436 (I3) and #437 (A6) against a local backend (local profile) and Vite
// with VITE_API_MOCK=0. Setup (event, form, the participant's apply and edit) goes through the HTTP
// API with the participant's own session; the operator screen is clicked.
// Usage: node notifications-click.mjs <outDir>
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const [outDir] = process.argv.slice(2);
const APP = "http://localhost:5173";
const OWNER = "00000000-0000-4000-8000-000000000001";
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

// ---- event and form: 이름, 전화, 이동 수단 ----
const op = await context(desktop);
await api(op, "POST", "/api/v1/operator/auth/login", { userId: OWNER });
const spaces = await api(op, "GET", "/api/v1/operator/spaces");
const spaceId = (spaces.items ?? spaces)[0].spaceId;
const { eventId } = await api(op, "POST", `/api/v1/operator/spaces/${spaceId}/events`, { name: "겨울 수련회" });
const created = await api(op, "POST", `/api/v1/operator/events/${eventId}/forms`, { customLabel: "식사" });
const formId = created.formId;
const cohort = created.fields.find((f) => f.systemKey === "COHORT");
if (cohort) await api(op, "PATCH", `/api/v1/operator/events/${eventId}/forms/${formId}/fields/${cohort.fieldId}`, { hidden: true });
const withTransport = await api(op, "POST", `/api/v1/operator/events/${eventId}/forms/${formId}/fields`, { label: "이동 수단" });
const field = Object.fromEntries(withTransport.fields.map((f) => [f.systemKey ?? f.label, f.fieldId]));
await api(op, "POST", `/api/v1/operator/events/${eventId}/activate`, { expectedLifecycleVersion: 0 });
await api(op, "PATCH", `/api/v1/operator/events/${eventId}/forms/${formId}`, { acceptingApplications: true });
note(`event ${eventId} form ${formId} open`);

const answers = (name, transport) => [
  { fieldId: field.NAME, text: name },
  { fieldId: field.PHONE, text: "010-4321-8765" },
  { fieldId: field["이동 수단"], text: transport },
];
const person = await context(phone);
const applied = await api(person, "POST", `/api/v1/public/events/${eventId}/forms/${formId}/applications`, { pin: PIN, answers: answers("김하나", "버스") });
note(`participant applied: revision ${applied.revision}`);

// ---- operator opens the event home: no badge yet ----
const page = await op.newPage();
await page.goto(`${APP}/events/${eventId}`);
await page.getByRole("link", { name: /^알림/ }).first().waitFor();
note(`badge before edit: ${await page.getByLabel(/읽지 않은 알림/).count()}`);
await page.screenshot({ path: `${outDir}/01-desktop-home-no-badge.png` });

// ---- the participant edits; the badge rises on the next check ----
const editedAt = Date.now();
await api(person, "PUT", "/api/v1/participant/application", { expectedRevision: 1, answers: answers("김하나", "자가용") });
await page.getByLabel("읽지 않은 알림 1개").first().waitFor({ timeout: 30_000 });
note(`badge 1 appeared ${((Date.now() - editedAt) / 1000).toFixed(1)}s after the edit (limit 30s)`);
await page.screenshot({ path: `${outDir}/02-desktop-badge.png` });

// A second edit merges into the same line.
await api(person, "PUT", "/api/v1/participant/application", { expectedRevision: 2, answers: answers("김하나", "기차") });
await page.getByRole("link", { name: /^알림/ }).first().click();
const list = page.getByRole("list", { name: "알림 목록" });
await list.waitFor();
await list.getByText("2번").waitFor({ timeout: 30_000 });
note(`list rows: ${await list.getByRole("listitem").count()}, text: ${(await list.getByRole("listitem").first().innerText()).replace(/\s+/g, " ")}`);
await page.screenshot({ path: `${outDir}/03-desktop-list-merged.png` });

// ---- open it: the detail with history and before → after ----
await list.getByRole("link").first().click();
await page.getByRole("heading", { name: "변경 이력" }).waitFor();
await page.getByRole("button", { name: "변경 전후 보기" }).first().click();
const diff = page.getByLabel("3번째 변경 전후");
await diff.waitFor();
note(`diff: ${(await diff.innerText()).replace(/\s+/g, " ")}`);
await page.getByRole("heading", { name: "변경 이력" }).scrollIntoViewIfNeeded();
await page.screenshot({ path: `${outDir}/04-desktop-detail-diff.png`, fullPage: true });
await page.getByLabel(/읽지 않은 알림/).first().waitFor({ state: "detached", timeout: 30_000 });
note("after opening: badge gone (read)");

// ---- table: 수정됨 ----
await page.goto(`${APP}/events/${eventId}/participants`);
await page.getByText("수정됨").first().waitFor();
note(`table shows 수정됨: ${await page.locator(".roster__tag--edited").count()} row(s)`);
await page.screenshot({ path: `${outDir}/05-desktop-table-edited.png` });

// ---- phone width ----
await api(person, "PUT", "/api/v1/participant/application", { expectedRevision: 3, answers: answers("김하나", "택시") });
const opPhone = await context(phone);
await api(opPhone, "POST", "/api/v1/operator/auth/login", { userId: OWNER });
const mobile = await opPhone.newPage();
await mobile.goto(`${APP}/events/${eventId}`);
const bar = mobile.getByRole("navigation", { name: "주요 메뉴" });
await bar.getByLabel("읽지 않은 알림 1개").waitFor({ timeout: 30_000 });
note("phone bottom bar badge: 1");
await mobile.screenshot({ path: `${outDir}/06-phone-bottom-badge.png` });
await bar.getByRole("link", { name: /알림/ }).click();
await mobile.getByRole("list", { name: "알림 목록" }).waitFor();
await mobile.screenshot({ path: `${outDir}/07-phone-list.png` });
await mobile.getByRole("button", { name: "모두 읽음" }).click();
await mobile.getByRole("button", { name: "모두 읽음" }).isDisabled();
await bar.getByLabel(/읽지 않은 알림/).waitFor({ state: "detached" });
note("phone 모두 읽음: badge gone");
await mobile.screenshot({ path: `${outDir}/08-phone-all-read.png` });
await mobile.getByRole("list", { name: "알림 목록" }).getByRole("link").first().click();
await mobile.getByRole("button", { name: "변경 전후 보기" }).first().click();
await mobile.getByLabel("4번째 변경 전후").waitFor();
await mobile.getByLabel("4번째 변경 전후").scrollIntoViewIfNeeded();
await mobile.screenshot({ path: `${outDir}/09-phone-detail-diff.png` });
await mobile.goto(`${APP}/events/${eventId}/participants`);
await mobile.getByText("수정됨").first().waitFor();
await mobile.screenshot({ path: `${outDir}/10-phone-table-edited.png` });

const { writeFileSync } = await import("node:fs");
writeFileSync(`${outDir}/click-log.txt`, log.join("\n") + "\n");
await browser.close();
