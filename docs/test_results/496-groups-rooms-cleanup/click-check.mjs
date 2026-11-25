// #496 목업 실제 클릭: 미배정 행 목록에서 끌어 옮기기, 골라서 보내기, 공개(확인 다이얼로그)까지.
// Usage: node click-check.mjs <outDir>
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const [outDir = "after"] = process.argv.slice(2);
const APP = "http://localhost:5173";
const EVENT = "00000000-0000-4000-8000-000000000020";
const OWNER = "00000000-0000-4000-8000-000000000001";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1800 }, deviceScaleFactor: 2, locale: "ko-KR", timezoneId: "Asia/Seoul" });
await ctx.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
const page = await ctx.newPage();
const log = (...a) => console.log(...a);
await page.goto(`${APP}/login?mockGroups=150&mockGroupCount=15`);
await page.waitForFunction(() => window.sceneMock?.operator && navigator.serviceWorker?.controller, null, { timeout: 20000 });
await page.evaluate(async ({ EVENT, OWNER }) => {
  window.sceneMock.operator.setLifecycle(EVENT, "ACTIVE", 1);
  const h = { "content-type": "application/json", "X-XSRF-TOKEN": "dev-csrf" };
  await fetch("/api/v1/operator/auth/login", { method: "POST", headers: h, body: JSON.stringify({ userId: OWNER }) });
  for (let i = 0; i < 4; i += 1)
    await fetch(`/api/v1/operator/events/${EVENT}/rooms`, { method: "POST", headers: h, body: JSON.stringify({ name: `${301 + i}호`, locationNote: null, capacity: 6, genderOptionId: null }) });
}, { EVENT, OWNER });
const go = (path) => page.evaluate((to) => { history.pushState({}, "", to); dispatchEvent(new PopStateEvent("popstate")); }, path);
const chip = () => page.locator(".event-groups__chip").textContent();
const notice = async () => (await page.locator(".event-groups__notice").last().textContent())?.trim();

async function dragRowTo(row, target) {
  // 창을 1800으로 키워 조·방 카드와 미배정 첫 행이 한 화면에 함께 보이게 한다.
  await page.evaluate(() => window.scrollTo(0, 0));
  const a = await row.boundingBox();
  await page.mouse.move(a.x + a.width * 0.6, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width * 0.6 + 10, a.y + a.height / 2 + 10, { steps: 3 });
  const b2 = await target.boundingBox();
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(900);
}

for (const screen of ["groups", "rooms"]) {
  await go(`/events/${EVENT}/${screen}`);
  await page.getByText(/^배정 \d/).waitFor();
  await page.waitForTimeout(800);
  log(`[${screen}] 시작`, await chip(), "| 행사 홈 버튼:", await page.getByRole("link", { name: "행사 홈", exact: true }).count());
  log(`[${screen}] 안내`, (await page.locator(".event-groups__hint").allTextContents()).join(" / "));
  const rows = page.locator(".event-groups__people > li .event-groups__pool-card--selectable");
  const card = page.locator(screen === "groups" ? ".event-groups__grid > li" : ".event-rooms__grid > li").first();
  // 1) 끌어 옮기기
  const first = (await rows.first().innerText()).split("\n")[0];
  await dragRowTo(rows.first(), card);
  log(`[${screen}] 끌기 '${first}' →`, await notice(), "|", await chip());
  // 2) 두 명 골라서 하단 막대로 보내기
  await rows.nth(0).locator("input[type=checkbox]").check();
  await rows.nth(1).locator("input[type=checkbox]").check();
  const bar = page.getByRole("region", { name: "고른 사람 옮기기" });
  log(`[${screen}] 막대`, await bar.locator(".event-groups__bar-count").textContent());
  // 이름을 눌러도 고르기가 된다(손잡이를 앞에 보이게 한 뒤에도). 확인 뒤 다시 눌러 풀어 둔다.
  const name = rows.nth(2).locator(".event-groups__name").first();
  await name.click();
  log(`[${screen}] 이름 눌러 고르기 →`, await bar.locator(".event-groups__bar-count").textContent());
  await name.click();
  const select = bar.locator("select");
  const value = await select.locator("option").nth(2).getAttribute("value");
  await select.selectOption(value);
  await bar.getByRole("button", { name: "보내기" }).click();
  await page.waitForTimeout(900);
  log(`[${screen}] 보내기 →`, await notice(), "|", await chip());
  await page.screenshot({ path: `${outDir}/click-${screen}-moved.png` });
  // 3) 공개: 확인 다이얼로그를 거친다
  await page.getByRole("button", { name: "참가자에게 공개" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  log(`[${screen}] 공개 확인 창`, (await dialog.locator("h2, h1").first().textContent())?.trim());
  await page.screenshot({ path: `${outDir}/click-${screen}-publish-dialog.png` });
  await dialog.getByRole("button", { name: /공개$/ }).last().click();
  await page.waitForTimeout(1200);
  if (await dialog.isVisible()) { await dialog.getByRole("button", { name: /공개$/ }).last().click(); await page.waitForTimeout(1200); }
  log(`[${screen}] 공개 →`, await notice());
  log(`[${screen}] 안내`, (await page.locator(".event-groups__hint").allTextContents()).join(" / "));
  await page.screenshot({ path: `${outDir}/click-${screen}-published.png` });
}
await browser.close();
