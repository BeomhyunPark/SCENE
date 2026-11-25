// 공용 Select 전/후 화면. VITE_API_MOCK=1 Vite에 붙여 쓴다.
// Usage: node select-shots.mjs <appUrl> <outDir> <prefix: before|after>
// before(기본 <select>)는 펼친 목록이 OS가 그리는 창이라 헤드리스 스크린샷에 나오지 않는다. 닫힘·포커스만 남는다.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const [APP, outDir, prefix = "after"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const EVENT = "00000000-0000-4000-8000-000000000020";
const OWNER = "00000000-0000-4000-8000-000000000001";
const SIZES = {
  1440: { viewport: { width: 1440, height: 1000 } },
  390: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
};
const browser = await chromium.launch();
const go = (page, path) => page.evaluate((to) => { history.pushState({}, "", to); dispatchEvent(new PopStateEvent("popstate")); }, path);
const login = (page) => page.evaluate(async (OWNER) => {
  const r = await fetch("/api/v1/operator/auth/login", { method: "POST", headers: { "Content-Type": "application/json", "X-XSRF-TOKEN": "dev-csrf" }, body: JSON.stringify({ userId: OWNER }) });
  if (!r.ok) throw new Error(`login ${r.status}`);
}, OWNER);
const after = prefix === "after";

async function setup(size) {
  const ctx = await browser.newContext({ ...SIZES[size], deviceScaleFactor: 2, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  await ctx.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date("2027-01-05T03:00:00Z"));
  await page.goto(`${APP}/login`);
  await page.waitForFunction(() => window.sceneMock?.schedule && navigator.serviceWorker?.controller, null, { timeout: 20000 });
  await page.evaluate(({ EVENT, OWNER }) => {
    const { schedule, operator, forms, participants } = window.sceneMock;
    operator.setLifecycle(EVENT, "ACTIVE", 2);
    schedule.setSchedulePeriod(EVENT, "2027-01-22", "2027-01-24");
    schedule.seedScheduleItem(EVENT, { day: 1, startTime: "19:30", endTime: "21:30", title: "저녁 집회", place: "대강당", category: "WORSHIP" });
    const form = forms.createForm(EVENT, OWNER, {});
    forms.setAccepting(EVENT, form.formId, OWNER, { acceptingApplications: true });
    ["김가람", "이나래", "박다온"].forEach((name, i) => {
      const answers = form.fields.flatMap((field) =>
        field.systemKey === "NAME" ? [{ fieldId: field.fieldId, text: name }] : field.systemKey === "PHONE" ? [{ fieldId: field.fieldId, text: `010-2222-33${i}0` }] : []);
      participants.submitPublicApplication(EVENT, form.formId, { answers, pin: "730914" });
    });
  }, { EVENT, OWNER });
  await login(page);
  return { ctx, page };
}

async function shotAround(page, locator, name, pad = 24, below = 0) {
  const box = await locator.boundingBox();
  const list = after ? page.locator('[role="listbox"]:visible') : null;
  let lb = list && (await list.count()) ? await list.first().boundingBox() : null;
  const top = Math.max(0, Math.min(box.y, lb ? lb.y : box.y) - pad - 40);
  const bottom = Math.max(box.y + box.height, lb ? lb.y + lb.height : 0) + pad + below;
  const vw = page.viewportSize().width;
  const left = Math.max(0, box.x - pad);
  const width = Math.min(vw - left, Math.max(box.width, lb ? lb.width : 0) + pad * 2);
  await page.screenshot({ path: `${outDir}/${prefix}-${name}.png`, clip: { x: left, y: top, width, height: bottom - top } });
}

async function schedule(size) {
  const { ctx, page } = await setup(size);
  await go(page, `/events/${EVENT}/schedule`);
  await page.getByRole("link", { name: "+ 일정 추가" }).first().click();
  const form = page.getByRole("form", { name: "일정 추가" });
  await form.waitFor();
  const control = form.getByRole("combobox", { name: "분류" });
  await control.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shotAround(page, control, `schedule-category-closed-${size}`);
  // 키보드 포커스: 장소 칸에서 Tab
  await form.getByLabel("장소 (선택)").focus();
  await page.keyboard.press("Tab");
  await shotAround(page, control, `schedule-category-focus-${size}`);
  if (after) {
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(150);
    await shotAround(page, control, `schedule-category-open-keyboard-${size}`);
    await page.keyboard.press("Escape");
    if (size === 390) await control.tap(); else await control.click();
    await page.waitForTimeout(150);
    await shotAround(page, control, `schedule-category-open-${size}`);
    await page.getByRole("option", { name: "조 모임" }).click();
    await page.waitForTimeout(150);
    await shotAround(page, control, `schedule-category-selected-${size}`);
    console.log(size, "선택 후 값:", await control.getAttribute("data-value"), await control.innerText());
    const tb = await control.boundingBox();
    console.log(size, "트리거 높이", tb.height, "글자", await control.evaluate((n) => getComputedStyle(n).fontSize));
    await control.click();
    const opt = await page.getByRole("option").first().boundingBox();
    console.log(size, "옵션 높이", opt.height);
    await page.keyboard.press("Escape");
  } else {
    await page.keyboard.press("Escape");
  }
  await page.screenshot({ path: `${outDir}/${prefix}-schedule-form-${size}.png` });
  await ctx.close();
}

async function operators(size) {
  const { ctx, page } = await setup(size);
  await go(page, `/events/${EVENT}/operators`);
  const control = page.getByRole("combobox", { name: "역할", exact: true });
  await control.waitFor({ timeout: 10000 });
  await control.scrollIntoViewIfNeeded();
  if (after) { await control.click(); await page.waitForTimeout(150); }
  await shotAround(page, control, `operators-role-${size}`, 24, after ? 0 : 0);
  await ctx.close();
}

async function participants(size) {
  const { ctx, page } = await setup(size);
  await go(page, `/events/${EVENT}/participants`);
  const control = page.getByRole("combobox", { name: "묶어 보기" });
  await control.waitFor({ timeout: 10000 });
  await control.scrollIntoViewIfNeeded();
  if (after) { await control.click(); await page.waitForTimeout(150); }
  await shotAround(page, control, `participants-groupby-${size}`);
  await ctx.close();
}

for (const size of [1440, 390]) {
  for (const run of [schedule, operators, participants]) {
    try { await run(size); } catch (error) { console.log(run.name, size, "실패:", error.message.split("\n")[0]); }
  }
}
await browser.close();
