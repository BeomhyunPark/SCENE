// #494 운영 멤버·조직 멤버 전/후 캡처. VITE_API_MOCK=1 pnpm dev(5173) 위에서 돌린다.
// Usage: node shots.mjs <outDir> <prefix> [states=1]
// states=1이면 행 메뉴·운영자 추가 다이얼로그(조직 멤버/이메일)·멤버 초대 다이얼로그를 연 상태도 찍는다.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const [outDir = "before", prefix = "before", states = "0"] = process.argv.slice(2);
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

for (const size of ["1440", "390"]) {
  const ctx = await browser.newContext({ ...SIZES[size], deviceScaleFactor: 2, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  await ctx.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
  const page = await ctx.newPage();
  await page.goto(`${APP}/login`);
  await page.waitForFunction(() => window.sceneMock && navigator.serviceWorker?.controller, null, { timeout: 20000 });
  await page.evaluate(async ({ EVENT, OWNER }) => {
    window.sceneMock.operator.setLifecycle(EVENT, "ACTIVE", 1);
    const h = { "content-type": "application/json", "X-XSRF-TOKEN": "dev-csrf" };
    await fetch("/api/v1/operator/auth/login", { method: "POST", headers: h, body: JSON.stringify({ userId: OWNER }) });
    await fetch(`/api/v1/operator/events/${EVENT}/invitations`, { method: "POST", headers: h, body: JSON.stringify({ email: "yerin@example.org", role: "STAFF" }) });
    const spaces = await (await fetch("/api/v1/operator/spaces")).json();
    const space = (spaces.items ?? [])[0]?.spaceId;
    await fetch(`/api/v1/operator/spaces/${space}/invitations`, { method: "POST", headers: h, body: JSON.stringify({ email: "jungyoon@example.org" }) });
  }, { EVENT, OWNER });
  const shot = (name) => page.screenshot({ path: `${outDir}/${prefix}-${name}-${size}.png`, fullPage: true });

  await go(page, `/events/${EVENT}/operators`);
  await page.getByText("Local staff").first().waitFor();
  await page.waitForTimeout(600);
  await shot("operators");
  if (states === "1") {
    await page.getByRole("button", { name: "Local staff 메뉴" }).click();
    await page.getByRole("menu").waitFor();
    await shot("operators-menu");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "운영자 추가" }).click();
    await page.getByRole("dialog").waitFor();
    await page.waitForTimeout(300);
    await shot("operators-add-member");
    await page.getByRole("dialog").getByText("외부 협력자 초대").click();
    await shot("operators-add-email");
    await page.keyboard.press("Escape");
  }
  await go(page, "/members");
  await page.getByText("Local manager").first().waitFor();
  await page.waitForTimeout(600);
  await shot("members");
  if (states === "1") {
    await page.getByRole("button", { name: "멤버 초대" }).click();
    await page.getByRole("dialog").waitFor();
    await page.waitForTimeout(300);
    await shot("members-invite");
  }
  await ctx.close();
}
await browser.close();
console.log("done");
