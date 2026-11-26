// 참가 현황 스프레드시트 (#509) 저장된 프로토타입 클릭 캡처. VITE_API_MOCK=1 Vite에 붙여 쓴다.
// Usage: node sheet-shots.mjs <appUrl> <outDir>
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const [APP, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const EVENT = "00000000-0000-4000-8000-000000000020";
const OWNER = "00000000-0000-4000-8000-000000000001";
const browser = await chromium.launch();
const go = (page, path) => page.evaluate((to) => { history.pushState({}, "", to); dispatchEvent(new PopStateEvent("popstate")); }, path);

const ctx = await browser.newContext({ viewport: { width: 1600, height: 960 }, deviceScaleFactor: 2, locale: "ko-KR", timezoneId: "Asia/Seoul" });
await ctx.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
const page = await ctx.newPage();
page.on("pageerror", (error) => console.log("pageerror", error.message));
await page.goto(`${APP}/login`);
await page.waitForFunction(() => window.sceneMock?.demo && navigator.serviceWorker?.controller, null, { timeout: 20000 });
await page.evaluate(({ EVENT }) => {
  window.sceneMock.operator.setLifecycle(EVENT, "ACTIVE", 2);
  window.sceneMock.demo.seedDemoRoster(40, EVENT);
}, { EVENT });
await page.evaluate(async (OWNER) => {
  const r = await fetch("/api/v1/operator/auth/login", { method: "POST", headers: { "Content-Type": "application/json", "X-XSRF-TOKEN": "dev-csrf" }, body: JSON.stringify({ userId: OWNER }) });
  if (!r.ok) throw new Error(`login ${r.status}`);
}, OWNER);
await go(page, `/events/${EVENT}/participants?density=compact`);
const grid = page.getByRole("grid", { name: "신청자 명단" });
await grid.waitFor();
await page.screenshot({ path: `${outDir}/1-full-width.png` });

const cell = (r, c) => grid.locator(`[data-r="${r}"][data-c="${c}"]`);
const labels = async () => grid.locator("thead th .roster__label").allTextContents();
async function type(r, c, text) {
  await cell(r, c).click();
  await page.keyboard.press("Enter");
  const editor = grid.getByRole("textbox");
  await editor.fill(text);
  await page.keyboard.press("Enter");
}

// 운영 열 추가 → 이름 바꾸기
await page.getByRole("button", { name: "+ 열", exact: true }).click();
await page.waitForFunction(() => [...document.querySelectorAll("thead .roster__label")].some((el) => el.textContent === "새 열"));
let c = (await labels()).indexOf("새 열");
await grid.locator("thead th").nth(c).click({ button: "right" });
await page.getByRole("menuitem", { name: "열 이름 바꾸기" }).click();
await page.getByRole("textbox", { name: "열 이름" }).fill("회비");
await page.keyboard.press("Enter");
await page.waitForFunction(() => [...document.querySelectorAll("thead .roster__label")].some((el) => el.textContent === "회비"));
c = (await labels()).indexOf("회비");
for (const [r, v] of [[0, "50000"], [1, "50000"], [3, "30000"], [4, "50000"], [6, "50000"]]) await type(r, c, v);

// 운영 줄 + 수식
await page.getByRole("button", { name: "+ 행", exact: true }).click();
await page.getByRole("button", { name: "+ 행", exact: true }).click();
await grid.evaluate((el) => (el.parentElement.scrollTop = el.parentElement.scrollHeight));
await grid.locator(".sheet-row--operator").nth(1).waitFor();
const letter = String.fromCharCode(65 + c);
await type(40, 0, "합계");
await type(40, c, `=SUM(${letter}:${letter})`);
await type(41, 0, "미입금");
await type(41, c, `=COUNTBLANK(${letter}1:${letter}40)&"명"`);

// 서식: 합계 줄 굵게 + 채우기
await cell(40, 0).click();
await cell(41, c).click({ modifiers: ["Shift"] });
await page.keyboard.press("Control+b");
await page.getByRole("button", { name: "채우기 색" }).click();
await page.getByRole("button", { name: "#fef7e0" }).click();

// 조건부 서식: 회비가 비어 있으면 빨갛게
await page.getByRole("button", { name: "조건부 서식" }).click();
await page.getByRole("combobox", { name: "열" }).click();
await page.getByRole("option", { name: "회비" }).click();
await page.getByRole("button", { name: "규칙 더하기" }).click();
await page.getByRole("button", { name: "닫기" }).click();

// 함수 입력 중 모습
await cell(41, c + 1 < (await labels()).length ? c + 1 : c).click();
await page.keyboard.type("=COU");
await page.screenshot({ path: `${outDir}/2-editing.png` });
await page.keyboard.press("Escape");

await grid.evaluate((el) => (el.parentElement.scrollTop = el.parentElement.scrollHeight));
await page.waitForTimeout(300);
await cell(40, c).click();
await page.screenshot({ path: `${outDir}/3-operator-rows-formulas.png` });

// 열 메뉴
await grid.locator("thead th").nth(c).click({ button: "right" });
await page.screenshot({ path: `${outDir}/4-column-menu.png` });
await page.keyboard.press("Escape");
await page.mouse.click(5, 5);

// 답 칸 고치기: 선택지 목록
console.log("labels", (await labels()).join(","));
await browser.close();
