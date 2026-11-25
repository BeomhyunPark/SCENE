// 공지 필터 칩: 보이는 높이 32px, 위·아래 4px 바깥(총 40px)을 눌러도 칩이 눌리는지 확인. Usage: node hit.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const APP = "http://localhost:5173", EVENT = "00000000-0000-4000-8000-000000000020";
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
const p = await ctx.newPage(); await p.goto(`${APP}/`);
await p.waitForFunction(() => window.sceneMock && navigator.serviceWorker?.controller);
await p.evaluate(() => fetch("/api/v1/operator/auth/login", { method: "POST", headers: { "Content-Type": "application/json", "X-XSRF-TOKEN": "dev-csrf" }, body: JSON.stringify({ userId: "00000000-0000-4000-8000-000000000001" }) }));
await p.evaluate((to) => { history.pushState({}, "", to); dispatchEvent(new PopStateEvent("popstate")); }, `/events/${EVENT}/notices`);
const chip = p.locator(".notices__filter", { hasText: "초안" }); await chip.waitFor();
const r = await chip.boundingBox();
console.log("hit above:", await p.evaluate(([x, y]) => document.elementFromPoint(x, y)?.className, [r.x + r.width / 2, r.y - 3]));
await p.touchscreen.tap(r.x + r.width / 2, r.y - 3); await p.waitForTimeout(500);
console.log("visual", Math.round(r.height), "tap 3px above → pressed:", await chip.getAttribute("aria-pressed"));
const r2 = await p.locator(".notices__filter", { hasText: "보관" }).boundingBox();
await p.touchscreen.tap(r2.x + r2.width / 2, r2.y + r2.height + 3); await p.waitForTimeout(500);
console.log("tap 3px below 보관 → pressed:", await p.locator(".notices__filter", { hasText: "보관" }).getAttribute("aria-pressed"));
await b.close();
