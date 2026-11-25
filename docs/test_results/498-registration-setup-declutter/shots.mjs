// 신청 설정 화면 전/후: 신청 받기 전 / 받는 중 / 닫힘(신청이 들어온 뒤)을 1440·390에서 찍고,
// 박스(네 변 테두리)·입력 칸·설명 줄 수를 센다. VITE_API_MOCK=1 pnpm dev 위에서 돌린다.
// Usage: node shots.mjs <outDir> <prefix>
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const [outDir = "before", prefix = "before"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const APP = "http://localhost:5173";
const SPACE = "00000000-0000-4000-8000-000000000010";
const OWNER = "00000000-0000-4000-8000-000000000001";
const SIZES = {
  1440: { viewport: { width: 1440, height: 900 } },
  390: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
};

const count = () => {
  const root = document.querySelector(".event-home");
  const vis = (n) => { const r = n.getBoundingClientRect(); const s = getComputedStyle(n); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  let containers = 0, controls = 0, depth = 0;
  const names = [];
  const boxed = [];
  for (const el of root.querySelectorAll("*")) {
    if (!vis(el)) continue;
    const s = getComputedStyle(el); const r = el.getBoundingClientRect();
    if (r.width < 16 && r.height < 16) continue;
    const sides = ["Top", "Right", "Bottom", "Left"].every((side) => parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== "none" && !/rgba\(0, 0, 0, 0\)/.test(s[`border${side}Color`]));
    const filled = s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== getComputedStyle(root).backgroundColor && r.width > 120 && r.height > 40;
    if (el.matches("button, input, textarea, select, a.scene-button, label")) { if (sides) controls += 1; continue; }
    if (sides) { containers += 1; names.push(String(el.className || el.tagName)); }
    if (sides || filled) boxed.push(el);
  }
  for (const el of boxed) { let d = 1, p = el.parentElement; while (p && p !== root) { if (boxed.includes(p)) d += 1; p = p.parentElement; } depth = Math.max(depth, d); }
  const inputs = [...root.querySelectorAll("input, textarea, select")].filter((n) => vis(n) && !n.closest(".form-preview")).length;
  const notes = [...root.querySelectorAll("p, small")].filter((n) => vis(n) && !n.closest(".form-preview, li, button") && n.innerText.trim()).map((n) => n.innerText.replace(/\s+/g, " ").trim());
  return { containers, controls, maxNesting: depth, inputs, noteCount: notes.length, notes, names };
};

const browser = await chromium.launch();
const results = [];
for (const size of ["1440", "390"]) {
  const ctx = await browser.newContext({ ...SIZES[size], deviceScaleFactor: 2, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  await ctx.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
  const page = await ctx.newPage();
  await page.goto(`${APP}/login`);
  await page.waitForFunction(() => window.sceneMock?.operator && navigator.serviceWorker?.controller, null, { timeout: 20000 });
  const ids = await page.evaluate(async ({ SPACE, OWNER }) => {
    const h = { "content-type": "application/json", "X-XSRF-TOKEN": "dev-csrf" };
    await fetch("/api/v1/operator/auth/login", { method: "POST", headers: h, body: JSON.stringify({ userId: OWNER }) });
    const event = await (await fetch(`/api/v1/operator/spaces/${SPACE}/events`, { method: "POST", headers: h, body: JSON.stringify({ name: "2027 겨울 수련회", startDate: "2027-01-22", endDate: "2027-01-24", place: "양평 수련원" }) })).json();
    window.sceneMock.operator.setLifecycle(event.eventId, "ACTIVE", 1);
    const form = await (await fetch(`/api/v1/operator/events/${event.eventId}/forms`, { method: "POST", headers: h, body: "{}" })).json();
    return { eventId: event.eventId, formId: form.formId };
  }, { SPACE, OWNER });
  const url = `/events/${ids.eventId}/participants/setup`;
  const go = async () => { await page.evaluate((to) => { history.pushState({}, "", to); dispatchEvent(new PopStateEvent("popstate")); }, url); await page.getByRole("region", { name: "받을 정보" }).waitFor(); await page.waitForTimeout(800); };
  await go();
  await page.getByRole("button", { name: "질문 만들기" }).click();
  await page.getByRole("region", { name: "받을 정보" }).getByText("성별").first().waitFor();
  await page.waitForTimeout(500);
  const shoot = async (state) => {
    await page.screenshot({ path: `${outDir}/${prefix}-setup-${state}-${size}.png`, fullPage: true });
    results.push({ state, size, ...(await page.evaluate(count)) });
  };
  await shoot("ready");
  await page.getByRole("button", { name: "신청 열기" }).click();
  await page.getByRole("button", { name: "신청 닫기" }).waitFor();
  await page.waitForTimeout(400);
  await shoot("open");
  await page.evaluate(({ eventId, formId }) => window.sceneMock.forms.markSubmitted(eventId, formId), ids);
  // The mock store lives in this tab, so leave and come back instead of reloading.
  await page.evaluate(() => { history.pushState({}, "", "/events"); dispatchEvent(new PopStateEvent("popstate")); });
  await page.waitForTimeout(500);
  await go();
  await page.getByRole("button", { name: "신청 닫기" }).click();
  await page.getByRole("button", { name: "신청 열기" }).waitFor();
  await page.waitForTimeout(400);
  await shoot("closed");
  await ctx.close();
}
await browser.close();
writeFileSync(`${outDir}/${prefix}-counts.json`, JSON.stringify(results, null, 2));
for (const r of results) console.log(r.state, r.size, "boxes", r.containers, "nest", r.maxNesting, "inputs", r.inputs, "notes", r.noteCount);
