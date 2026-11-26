// #497 참가 현황·신청자 화면 전/후 캡처. VITE_API_MOCK=1 pnpm dev 위에서 돌린다.
// 시드는 483-ui-clutter-audit/capture.mjs와 같은 방식(신청 40명)이다.
// Usage: node shots.mjs <outDir> <prefix>
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
const e = `/events/${EVENT}`;
const browser = await chromium.launch();
const go = (page, path) => page.evaluate((to) => { history.pushState({}, "", to); dispatchEvent(new PopStateEvent("popstate")); }, path);

async function boot(size) {
  const ctx = await browser.newContext({ ...SIZES[size], deviceScaleFactor: 2, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  await ctx.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
  const page = await ctx.newPage();
  await page.goto(`${APP}/login`);
  await page.waitForFunction(() => window.sceneMock && navigator.serviceWorker?.controller, null, { timeout: 20000 });
  await page.evaluate(async ({ EVENT }) => window.sceneMock.operator.setLifecycle(EVENT, "ACTIVE", 1), { EVENT });
  const h = { "content-type": "application/json", "X-XSRF-TOKEN": "dev-csrf" };
  await page.evaluate(async ({ OWNER, h }) => {
    await fetch("/api/v1/operator/auth/login", { method: "POST", headers: h, body: JSON.stringify({ userId: OWNER }) });
  }, { OWNER, h });
  return { ctx, page, h };
}

async function seedApplicants(page, h) {
  return page.evaluate(async ({ EVENT, OWNER, h }) => {
    const form = await (await fetch(`/api/v1/operator/events/${EVENT}/forms`, { method: "POST", headers: h, body: "{}" })).json();
    await fetch(`/api/v1/operator/events/${EVENT}/forms/${form.formId}`, { method: "PATCH", headers: h, body: JSON.stringify({ acceptingApplications: true }) });
    const detail = await (await fetch(`/api/v1/operator/events/${EVENT}/forms/${form.formId}`)).json();
    const f = Object.fromEntries(detail.fields.map((x) => [x.presetKey ?? x.systemKey, x.fieldId]));
    const fam = ["김", "이", "박", "최", "정", "강", "조", "윤"], giv = ["하늘", "서준", "수아", "예린", "민준"];
    for (let i = 0; i < 40; i += 1) {
      const answers = [{ fieldId: f.NAME, text: fam[i % 8] + giv[i % 5] }, { fieldId: f.PHONE, text: `010-42${String(10 + i).padStart(2, "0")}-${String(1000 + i)}` }];
      if (f.COHORT) answers.push({ fieldId: f.COHORT, text: String(90 + (i % 10)) });
      await fetch(`/api/v1/public/events/${EVENT}/forms/${form.formId}/applications`, { method: "POST", headers: h, body: JSON.stringify({ pin: "730914", answers }) });
    }
    await fetch("/api/v1/operator/auth/login", { method: "POST", headers: h, body: JSON.stringify({ userId: OWNER }) });
    const apps = await (await fetch(`/api/v1/operator/events/${EVENT}/applications`)).json();
    return { app: (apps.items ?? apps)[0]?.applicationId };
  }, { EVENT, OWNER, h });
}

async function shot(page, name, size, full = true) {
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outDir}/${prefix}-${name}-${size}.png`, fullPage: full });
  console.log("saved", `${prefix}-${name}-${size}`);
}

for (const size of ["1440", "390"]) {
  // 빈 상태(신청 없음)
  {
    const { ctx, page } = await boot(size);
    await go(page, `${e}/participants`);
    await shot(page, "participants-empty", size);
    await ctx.close();
  }
  const { ctx, page, h } = await boot(size);
  const ids = await seedApplicants(page, h);
  await go(page, `${e}/participants`);
  await shot(page, "participants", size);
  const address = page.getByRole("button", { name: "주소·QR" });
  if (await address.count()) {
    await address.click();
    await shot(page, "participants-address", size, false);
    await page.keyboard.press("Escape");
  }
  const help = page.locator(".roster__keys summary");
  if (await help.count()) {
    await help.click();
    await page.locator(".roster__keys").scrollIntoViewIfNeeded();
    await shot(page, "participants-help", size, false);
  }
  await go(page, `${e}/participants/summary`);
  await shot(page, "summary", size, false);
  await go(page, `${e}/participants/${ids.app}`);
  await shot(page, "application", size);
  await go(page, `${e}/participants/${ids.app}/edit`);
  await shot(page, "application-edit", size);
  await go(page, `${e}/participants/new`);
  await shot(page, "participant-add", size);
  await ctx.close();
}
await browser.close();
