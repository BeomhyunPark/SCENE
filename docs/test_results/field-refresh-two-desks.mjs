import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const [eventId, outDir] = process.argv.slice(2);
const APP = "http://localhost:5173";
const OWNER = "00000000-0000-4000-8000-000000000001";
const STAFF = "00000000-0000-4000-8000-000000000003";
const log = [];
const note = (line) => { log.push(line); console.log(line); };

const browser = await chromium.launch();
async function desk(userId) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  await context.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
  const res = await context.request.post(`${APP}/api/v1/operator/auth/login`, { headers: { "X-XSRF-TOKEN": "dev-csrf" }, data: { userId } });
  if (!res.ok()) throw new Error(`login ${res.status()}`);
  const page = await context.newPage();
  const reads = [];
  page.on("request", (r) => { if (r.url().includes("/check-in")) reads.push({ at: Date.now(), url: r.url().replace(/^.*\/events\/[^/]+/, "") }); });
  await page.goto(`${APP}/events/${eventId}/field`);
  await page.getByText("120명").waitFor({ timeout: 15000 });
  return { page, reads };
}
const count = (page, label) => page.getByRole("region", { name: "체크인 현황" }).locator("p", { hasText: label }).first().locator("strong").textContent();
const row = (page, name) => page.getByRole("list", { name: "체크인 명단" }).getByRole("listitem").filter({ has: page.locator(".event-field__name", { hasText: name }) });
const badge = (page, name) => row(page, name).locator(".event-field__badge").textContent();
async function waitFor(fn, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) { if (await fn()) return Date.now() - start; await new Promise((r) => setTimeout(r, 100)); }
  return null;
}
async function checkInOnA(a, name) {
  await a.page.getByLabel("이름 또는 전화 끝 4자리").fill(name.split(" ")[1]);
  await row(a.page, name).getByRole("button", { name: `${name} 체크인` }).click();
  await a.page.getByText(`${name} 님을 체크인했어요.`).waitFor();
  await a.page.getByLabel("이름 또는 전화 끝 4자리").blur();
  return Date.now();
}

const A = await desk(OWNER);
const B = await desk(STAFF);
await A.page.screenshot({ path: `${outDir}/field-refresh-1-desk-a.png` });
await B.page.screenshot({ path: `${outDir}/field-refresh-1-desk-b.png` });
note(`B bar: ${await B.page.locator(".event-field__refresh").innerText()}`);

// 1. A checks in; B, untouched, shows it within one interval.
const t0 = await checkInOnA(A, "90 김하늘");
const seen = await waitFor(async () => (await count(B.page, "체크인 완료")) === "1" && (await badge(B.page, "90 김하늘")) === "체크인 완료", 15000);
note(`1. A 체크인 → B 현황·명단에 보임: ${seen === null ? "15초 안에 안 보임" : `${((Date.now() - t0) / 1000).toFixed(1)}초`}`);
await B.page.screenshot({ path: `${outDir}/field-refresh-2-desk-b-seen.png` });

// 2. B is typing a search: numbers move, the list waits; leaving the box reads the list at once.
await B.page.getByLabel("이름 또는 전화 끝 4자리").focus();
await checkInOnA(A, "92 박서준");
const numbers = await waitFor(async () => (await count(B.page, "체크인 완료")) === "2", 15000);
await B.page.waitForTimeout(11000);
const heldBadge = await badge(B.page, "92 박서준");
note(`2. B 검색 칸에 커서: 숫자 2 (${numbers === null ? "안 바뀜" : "바뀜"}), 명단의 92 박서준 = ${heldBadge}`);
await B.page.screenshot({ path: `${outDir}/field-refresh-3-desk-b-typing.png` });
await B.page.getByLabel("이름 또는 전화 끝 4자리").blur();
const afterBlur = await waitFor(async () => (await badge(B.page, "92 박서준")) === "체크인 완료", 5000);
note(`   검색 칸을 떠나면: ${afterBlur === null ? "안 바뀜" : `${(afterBlur / 1000).toFixed(1)}초 뒤 체크인 완료`}`);

// 3. B loaded page 2 and scrolled; a refresh keeps both.
await B.page.getByRole("button", { name: "더 보기" }).click();
await B.page.getByRole("button", { name: "더 보기" }).waitFor();
await row(B.page, "99 임하늘").scrollIntoViewIfNeeded();
const rowsBefore = await B.page.getByRole("list", { name: "체크인 명단" }).getByRole("listitem").count();
const yBefore = await B.page.evaluate(() => window.scrollY);
await checkInOnA(A, "99 임하늘");
const scrolled = await waitFor(async () => (await badge(B.page, "99 임하늘")) === "체크인 완료", 15000);
await B.page.waitForTimeout(300);
const rowsAfter = await B.page.getByRole("list", { name: "체크인 명단" }).getByRole("listitem").count();
const yAfter = await B.page.evaluate(() => window.scrollY);
note(`3. 둘째 쪽까지 읽고 내려간 B: ${scrolled === null ? "안 보임" : "99 임하늘 체크인 완료"}, 줄 ${rowsBefore}→${rowsAfter}, scrollY ${yBefore}→${yAfter}`);
await B.page.screenshot({ path: `${outDir}/field-refresh-4-desk-b-scrolled.png` });

// 4. 새로 고침 on B reads at once.
await checkInOnA(A, "92 박수아");
await B.page.evaluate(() => window.scrollTo(0, 0));
const tClick = Date.now();
await B.page.getByRole("button", { name: "새로 고침" }).click();
const now = await waitFor(async () => (await count(B.page, "체크인 완료")) === "4", 5000);
note(`4. B 새로 고침: ${now === null ? "안 바뀜" : `${((Date.now() - tClick) / 1000).toFixed(1)}초 안에 숫자 4`}`);
await B.page.screenshot({ path: `${outDir}/field-refresh-5-desk-b-button.png` });

// 5. Idle load from one desk for 30 s.
const from = Date.now();
await B.page.waitForTimeout(30000);
const idle = B.reads.filter((r) => r.at >= from);
note(`5. B가 30초 가만히 있을 때 요청 ${idle.length}건: ${[...new Set(idle.map((r) => r.url.split("?")[0]))].map((u) => `${u} ×${idle.filter((r) => r.url.startsWith(u)).length}`).join(", ")}`);

// 6. Hidden tab: no reads; visible again reads at once.
const setHidden = (hidden) => B.page.evaluate((h) => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
  document.dispatchEvent(new Event("visibilitychange"));
}, hidden);
await setHidden(true);
const hiddenFrom = Date.now();
await B.page.waitForTimeout(21000);
const hiddenReads = B.reads.filter((r) => r.at >= hiddenFrom).length;
const shownAt = Date.now();
await setHidden(false);
await B.page.waitForTimeout(1500);
const shownReads = B.reads.filter((r) => r.at >= shownAt).length;
note(`6. 탭 숨김 21초 동안 요청 ${hiddenReads}건, 다시 보인 직후 1.5초 안에 ${shownReads}건`);

await browser.close();
console.log("LOG_JSON " + JSON.stringify(log));
