// Every OperatorShell screen (VITE_API_MOCK=1): screenshot + left edges of the header title and the body content.
// Usage: VITE_API_MOCK=1 pnpm dev, then node audit.mjs <outDir> <prefix>. Prints size, screen, framed, title left, content left, diff, body roots.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const [outDir, prefix = "after"] = process.argv.slice(2);
const APP = "http://localhost:5173";
const EVENT = "00000000-0000-4000-8000-000000000020";
const SPACE = "00000000-0000-4000-8000-000000000010";
const OWNER = "00000000-0000-4000-8000-000000000001";
const browser = await chromium.launch();
const sizes = [
  ["1440", { viewport: { width: 1440, height: 900 } }, false],
  ["1440c", { viewport: { width: 1440, height: 900 } }, true],
  ["2000", { viewport: { width: 2000, height: 1100 } }, false],
  ["2000c", { viewport: { width: 2000, height: 1100 } }, true],
  ["390", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, false],
];
const e = `/events/${EVENT}`;
const screens = [
  ["events", "/events"], ["members", "/members"], ["settings", "/settings"], ["org-notifications", "/notifications"],
  ["history", "/history"], ["leave", `/spaces/${SPACE}/leave`], ["event-new", "/events/new"],
  ["home", e], ["event-settings", `${e}/settings`], ["areas", `${e}/areas`], ["field", `${e}/field`],
  ["notifications", `${e}/notifications`], ["groups", `${e}/groups`], ["schedule", `${e}/schedule`],
  ["end", `${e}/end`], ["retrospective", `${e}/retrospective`], ["tasks", `${e}/tasks`], ["task", `${e}/tasks/:task`],
  ["setup", `${e}/participants/setup`], ["summary", `${e}/participants/summary`], ["operators", `${e}/operators`],
  ["notices", `${e}/notices`], ["participants", `${e}/participants`], ["application", `${e}/participants/:app`],
];
const rows = [];
for (const [label, opts, collapsed] of sizes) {
  const ctx = await browser.newContext({ ...opts, deviceScaleFactor: 1, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  await ctx.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: APP }]);
  const page = await ctx.newPage();
  await page.addInitScript((c) => { try { if (c) localStorage.setItem("scene.operatorSidebar.collapsed", "1"); } catch {} }, collapsed);
  await page.goto(`${APP}/login`);
  await page.waitForFunction(() => window.sceneMock?.schedule && navigator.serviceWorker?.controller, null, { timeout: 20000 });
  const ids = await page.evaluate(async ({ EVENT, OWNER }) => {
    const m = window.sceneMock;
    m.operator.setLifecycle(EVENT, "ACTIVE", 1);
    m.schedule.setSchedulePeriod(EVENT, "2026-11-23", "2026-11-25");
    m.schedule.seedScheduleItem(EVENT, { day: 2, startTime: "09:00", endTime: "10:30", title: "아침 예배", place: "본당", category: "WORSHIP" });
    const h = { "content-type": "application/json", "X-XSRF-TOKEN": "dev-csrf" };
    await fetch("/api/v1/operator/auth/login", { method: "POST", headers: h, body: JSON.stringify({ userId: OWNER }) });
    const tasks = await (await fetch(`/api/v1/operator/events/${EVENT}/tasks`)).json().catch(() => ({}));
    const apps = await (await fetch(`/api/v1/operator/events/${EVENT}/applications`)).json().catch(() => ({}));
    const t = (tasks.items ?? tasks)[0]?.taskId;
    const a = (apps.items ?? apps)[0]?.applicationId;
    return { t, a };
  }, { EVENT, OWNER });
  for (const [name, raw] of screens) {
   try {
    const path = raw.replace(":task", ids.t ?? "none").replace(":app", ids.a ?? "none");
    await page.evaluate((path) => { history.pushState({}, "", path); dispatchEvent(new PopStateEvent("popstate")); }, path);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const ok = await page.waitForSelector(".operator-shell__main", { timeout: 4000 }).then(() => true, () => false);
      if (ok) break;
      await page.evaluate((path) => { history.pushState({}, "", "/events"); dispatchEvent(new PopStateEvent("popstate"));
        setTimeout(() => { history.pushState({}, "", path); dispatchEvent(new PopStateEvent("popstate")); }, 1500); }, path);
      await page.waitForTimeout(2000);
    }
    await page.waitForTimeout(900);
    const m = await page.evaluate(() => {
      const main = document.querySelector(".operator-shell__main");
      if (!main) return null;
      const title = document.querySelector(".operator-shell__heading")?.getBoundingClientRect();
      const body = [...main.children].filter((c) => !c.matches(".operator-shell__header"));
      // left edge of the first visible content inside the body root
      const leftOf = (el) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT);
        let min = Infinity;
        for (let n = walker.currentNode; n; n = walker.nextNode()) {
          const r = n.getBoundingClientRect();
          if (r.width && r.height && n.children.length === 0 && getComputedStyle(n).position !== "fixed") min = Math.min(min, r.left);
        }
        return Math.round(min);
      };
      const root = body[0];
      const rr = root?.getBoundingClientRect();
      return {
        framed: main.classList.contains("operator-shell__main--framed"),
        title: Math.round(title?.left ?? -1),
        children: body.map((c) => c.className || c.tagName).join(" | "),
        content: root ? leftOf(root) : -1,
        right: rr ? Math.round(window.innerWidth - rr.right) : -1,
      };
    });
    rows.push({ size: label, name, ...m });
    await page.screenshot({ path: `${outDir}/${prefix}-${name}-${label}.png`, fullPage: label === "390" });
   } catch (error) { rows.push({ size: label, name, error: String(error).slice(0, 120) }); if (page.isClosed()) break; }
  }
  await ctx.close();
}
await browser.close();
writeFileSync(`${outDir}/${prefix}-audit.json`, JSON.stringify(rows, null, 1));
for (const r of rows) console.log([r.size, r.name, r.framed, r.title, r.content, r.content - r.title, r.children].join("\t"));
