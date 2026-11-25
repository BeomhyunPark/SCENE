// Collapsed sidebar shots (VITE_API_MOCK=1 pnpm dev on :5173). Usage: node shoot.mjs <outDir> <prefix>
// Prints the sidebar geometry: width, nav items (box), current item, icons, avatar, toggle, focus ring.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const [outDir, prefix] = process.argv.slice(2);
const APP = "http://localhost:5173";
const EVENT = "00000000-0000-4000-8000-000000000020";
const OWNER = "00000000-0000-4000-8000-000000000001";
const browser = await chromium.launch();
const runs = [
  ["1440c", 1440, true], ["2000c", 2000, true], ["1440-expanded", 1440, false],
];
const screens = [["home", `/events/${EVENT}`], ["events", "/events"], ["members", "/members"]];
const report = [];
for (const [label, width, collapsed] of runs) {
  const ctx = await browser.newContext({ viewport: { width, height: 1100 }, deviceScaleFactor: 2, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  await ctx.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
  const page = await ctx.newPage();
  await page.addInitScript((c) => { try { if (c) localStorage.setItem("scene.operatorSidebar.collapsed", "1"); } catch {} }, collapsed);
  await page.goto(`${APP}/login`);
  await page.waitForFunction(() => window.sceneMock?.operator && navigator.serviceWorker?.controller, null, { timeout: 20000 });
  await page.evaluate(async ({ EVENT, OWNER }) => {
    window.sceneMock.operator.setLifecycle(EVENT, "ACTIVE", 1);
    await fetch("/api/v1/operator/auth/login", { method: "POST", headers: { "content-type": "application/json", "X-XSRF-TOKEN": "dev-csrf" }, body: JSON.stringify({ userId: OWNER }) });
  }, { EVENT, OWNER });
  for (const [name, path] of screens) {
    await page.evaluate((p) => { history.pushState({}, "", p); dispatchEvent(new PopStateEvent("popstate")); }, path);
    await page.waitForSelector(".operator-shell__sidebar .operator-shell__item", { timeout: 8000 });
    await page.waitForTimeout(800);
    const geo = await page.evaluate(() => {
      const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
      const side = document.querySelector(".operator-shell__sidebar");
      const items = [...side.querySelectorAll(".operator-shell__item")];
      return {
        sidebar: r(side),
        items: items.map((i) => ({ box: r(i), icon: r(i.querySelector("img")), name: i.getAttribute("title") ?? i.textContent.trim(), current: i.classList.contains("operator-shell__item--current") })),
        toggle: r(side.querySelector(".operator-shell__collapse")),
        avatar: r(side.querySelector(".operator-shell__avatar")),
        title: r(document.querySelector(".operator-shell__heading")),
        overflow: side.scrollWidth > side.clientWidth,
      };
    });
    report.push({ run: label, screen: name, ...geo });
    await page.screenshot({ path: `${outDir}/${prefix}-${name}-${label}.png` });
    if (collapsed && name === "home") {
      // focus ring on a collapsed item
      await page.locator(".operator-shell__sidebar .operator-shell__item").nth(2).focus();
      await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab");
      await page.screenshot({ path: `${outDir}/${prefix}-focus-${label}.png`, clip: { x: 0, y: 0, width: 260, height: 700 } });
    }
  }
  await ctx.close();
}
await browser.close();
writeFileSync(`${outDir}/${prefix}-geometry.json`, JSON.stringify(report, null, 1));
for (const r of report) {
  const cur = r.items.find((i) => i.current);
  console.log(r.run, r.screen, "sidebar", r.sidebar?.[2], "item0", JSON.stringify(r.items[0]?.box), "icon0", JSON.stringify(r.items[0]?.icon), "current", JSON.stringify(cur?.box), "toggle", JSON.stringify(r.toggle), "avatar", JSON.stringify(r.avatar), "title.x", r.title?.[0], "overflow", r.overflow);
}
