// #483 실제 클릭: 참가 현황·신청 설정의 "행사 설정"이 행사 설정 화면으로 가는지(목업 서버).
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const APP = "http://localhost:5173", EVENT = "00000000-0000-4000-8000-000000000020", OWNER = "00000000-0000-4000-8000-000000000001";
const browser = await chromium.launch();
for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const ctx = await browser.newContext({ viewport: size, locale: "ko-KR" });
  await ctx.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
  const page = await ctx.newPage();
  await page.goto(`${APP}/login`);
  await page.waitForFunction(() => window.sceneMock && navigator.serviceWorker?.controller, null, { timeout: 20000 });
  await page.evaluate(async (OWNER) => { await fetch("/api/v1/operator/auth/login", { method: "POST", headers: { "content-type": "application/json", "X-XSRF-TOKEN": "dev-csrf" }, body: JSON.stringify({ userId: OWNER }) }); }, OWNER);
  for (const from of ["participants", "participants/setup"]) {
    await page.evaluate((to) => { history.pushState({}, "", to); dispatchEvent(new PopStateEvent("popstate")); }, `/events/${EVENT}/${from}`);
    await page.getByRole("button", { name: "행사 설정" }).click();
    await page.getByRole("heading", { level: 2, name: "행사 설정" }).waitFor({ timeout: 8000 });
    console.log(`${size.width} ${from}: "행사 설정" 클릭 → ${new URL(page.url()).pathname}`);
  }
  await ctx.close();
}
await browser.close();
