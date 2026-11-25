// #496 조 편성·숙소 전/후 캡처. VITE_API_MOCK=1 pnpm dev 위에서 돌린다.
// Usage: node shots.mjs <outDir> <prefix>
// 상태: many = 조 150명·15조(?mockGroups=150&mockGroupCount=15), 숙소는 방 8개(정원 6) + 미배정 다수
//       small = 기본 시드(조 편성 소수), 숙소는 방 없음(빈 상태)
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const [outDir = "before", prefix = "before"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const APP = "http://localhost:5173";
const EVENT = "00000000-0000-4000-8000-000000000020";
const OWNER = "00000000-0000-4000-8000-000000000001";
const SIZES = {
  1440: { viewport: { width: 1440, height: 900 } },
  390: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
};
const browser = await chromium.launch();
const go = (page, path) => page.evaluate((to) => { history.pushState({}, "", to); dispatchEvent(new PopStateEvent("popstate")); }, path);

async function open(size, query) {
  const ctx = await browser.newContext({ ...SIZES[size], deviceScaleFactor: 2, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  await ctx.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
  const page = await ctx.newPage();
  await page.goto(`${APP}/login${query}`);
  await page.waitForFunction(() => window.sceneMock?.operator && navigator.serviceWorker?.controller, null, { timeout: 20000 });
  await page.evaluate(async ({ EVENT, OWNER }) => {
    window.sceneMock.operator.setLifecycle(EVENT, "ACTIVE", 1);
    await fetch("/api/v1/operator/auth/login", { method: "POST", headers: { "content-type": "application/json", "X-XSRF-TOKEN": "dev-csrf" }, body: JSON.stringify({ userId: OWNER }) });
  }, { EVENT, OWNER });
  return { ctx, page };
}

async function addRooms(page, n) {
  await page.evaluate(async ({ EVENT, n }) => {
    const h = { "content-type": "application/json", "X-XSRF-TOKEN": "dev-csrf" };
    for (let i = 0; i < n; i += 1)
      await fetch(`/api/v1/operator/events/${EVENT}/rooms`, { method: "POST", headers: h, body: JSON.stringify({ name: `${301 + i}호`, locationNote: null, capacity: 6, genderOptionId: null }) });
  }, { EVENT, n });
}

async function shot(page, path, name, size) {
  await go(page, path);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${outDir}/${prefix}-${name}-${size}.png`, fullPage: true });
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log(size, name, `pageHeight=${h}`);
}

for (const size of Object.keys(SIZES)) {
  {
    const { ctx, page } = await open(size, "?mockGroups=150&mockGroupCount=15");
    await addRooms(page, 8);
    await shot(page, `/events/${EVENT}/groups`, "groups-many", size);
    await shot(page, `/events/${EVENT}/rooms`, "rooms-many", size);
    await ctx.close();
  }
  {
    const { ctx, page } = await open(size, "");
    await shot(page, `/events/${EVENT}/groups`, "groups-small", size);
    await shot(page, `/events/${EVENT}/rooms`, "rooms-no-rooms", size);
    await ctx.close();
  }
}
await browser.close();
