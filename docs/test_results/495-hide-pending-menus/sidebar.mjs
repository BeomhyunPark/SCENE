// #495 사이드바 전/후: 조직·행사 화면에서 펼침·접힘(1440), 휴대폰 서랍·하단 탭 바(390).
// VITE_API_MOCK=1 pnpm dev 위에서 돌린다. Usage: node sidebar.mjs <outDir> <prefix>
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const [outDir = "before", prefix = "before"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const APP = "http://localhost:5173";
const EVENT = "00000000-0000-4000-8000-000000000020";
const OWNER = "00000000-0000-4000-8000-000000000001";
const browser = await chromium.launch();
async function ctxFor(size) {
  const ctx = await browser.newContext({
    ...(size === 390 ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } }),
    deviceScaleFactor: 2, locale: "ko-KR", timezoneId: "Asia/Seoul",
  });
  await ctx.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
  const page = await ctx.newPage();
  await page.goto(`${APP}/login`);
  await page.waitForFunction(() => window.sceneMock && navigator.serviceWorker?.controller, null, { timeout: 20000 });
  await page.evaluate(async (OWNER) => {
    await fetch("/api/v1/operator/auth/login", { method: "POST", headers: { "content-type": "application/json", "X-XSRF-TOKEN": "dev-csrf" }, body: JSON.stringify({ userId: OWNER }) });
  }, OWNER);
  return { ctx, page };
}
const go = (page, path) => page.evaluate((to) => { history.pushState({}, "", to); dispatchEvent(new PopStateEvent("popstate")); }, path);
const places = [["org", "/events"], ["event", `/events/${EVENT}`]];
const links = async (page, sel) => page.$$eval(`${sel} a, ${sel} button`, (ns) => ns.map((n) => (n.getAttribute("title") || n.innerText).trim()).filter(Boolean));
{
  const { ctx, page } = await ctxFor(1440);
  for (const collapsed of [false, true]) {
    for (const [name, path] of places) {
      await go(page, path);
      await page.waitForTimeout(1500);
      const btn = page.getByRole("button", { name: collapsed ? "사이드바 접기" : "사이드바 펼치기" });
      if (await btn.count()) { await btn.click(); await page.waitForTimeout(400); }
      const side = page.locator(".operator-shell__sidebar");
      await side.screenshot({ path: `${outDir}/${prefix}-sidebar-${name}-${collapsed ? "collapsed" : "open"}-1440.png` });
      console.log(1440, name, collapsed ? "collapsed" : "open", JSON.stringify(await links(page, ".operator-shell__sidebar nav")));
    }
  }
  await ctx.close();
}
{
  const { ctx, page } = await ctxFor(390);
  for (const [name, path] of places) {
    await go(page, path);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${outDir}/${prefix}-bottombar-${name}-390.png` });
    await page.getByRole("button", { name: "전체 메뉴" }).first().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${outDir}/${prefix}-drawer-${name}-390.png` });
    console.log(390, name, "drawer", JSON.stringify(await links(page, "[role=dialog] nav")));
  }
  await ctx.close();
}
await browser.close();
