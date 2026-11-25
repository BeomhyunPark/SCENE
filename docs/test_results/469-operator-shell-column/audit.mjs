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
  await page.goto(`${APP}/login?mockGroups=150&mockGroupCount=15`);
  await page.waitForFunction(() => window.sceneMock?.schedule && navigator.serviceWorker?.controller, null, { timeout: 20000 });
  const ids = await page.evaluate(async ({ EVENT, OWNER }) => {
    const m = window.sceneMock;
    m.operator.setLifecycle(EVENT, "ACTIVE", 1);
    m.schedule.setSchedulePeriod(EVENT, "2026-11-23", "2026-11-25");
    const seed = (day, startTime, endTime, title, place, category) =>
      m.schedule.seedScheduleItem(EVENT, { day, startTime, endTime, title, place, category });
    seed(1, "15:00", "16:00", "도착·등록", "로비", "MOVE");
    seed(1, "18:00", "19:00", "저녁 식사", "식당", "MEAL");
    seed(1, "19:30", "21:30", "여는 예배", "본당", "WORSHIP");
    seed(2, "07:30", "08:30", "아침 식사", "식당", "MEAL");
    seed(2, "09:00", "10:30", "아침 예배", "본당", "WORSHIP");
    seed(2, "10:45", "12:00", "조별 모임", "소그룹실", "GROUP");
    seed(2, "13:30", "15:00", "특강", "본당", "PROGRAM");
    seed(2, "19:30", "21:30", "저녁 집회", "본당", "WORSHIP");
    seed(3, "09:30", "11:00", "닫는 예배", "본당", "WORSHIP");
    const h = { "content-type": "application/json", "X-XSRF-TOKEN": "dev-csrf" };
    await fetch("/api/v1/operator/auth/login", { method: "POST", headers: h, body: JSON.stringify({ userId: OWNER }) });
    // 40 applications, so the participant table and summary have rows
    const form = await (await fetch(`/api/v1/operator/events/${EVENT}/forms`, { method: "POST", headers: h, body: "{}" })).json();
    if (form?.formId) {
      await fetch(`/api/v1/operator/events/${EVENT}/forms/${form.formId}`, { method: "PATCH", headers: h, body: JSON.stringify({ acceptingApplications: true }) });
      const detail = await (await fetch(`/api/v1/operator/events/${EVENT}/forms/${form.formId}`)).json();
      const f = Object.fromEntries(detail.fields.map((x) => [x.presetKey ?? x.systemKey, x.fieldId]));
      const fam = ["김", "이", "박", "최", "정", "강", "조", "윤"], giv = ["하늘", "서준", "수아", "예린", "민준"];
      for (let i = 0; i < 40; i += 1) {
        const answers = [{ fieldId: f.NAME, text: fam[i % 8] + giv[i % 5] }, { fieldId: f.PHONE, text: `010-42${String(10 + i).padStart(2, "0")}-${String(1000 + i)}` }];
        if (f.COHORT) answers.push({ fieldId: f.COHORT, text: String(90 + (i % 10)) });
        if (f.CONSENT) answers.push({ fieldId: f.CONSENT, value: { value: true } });
        await fetch(`/api/v1/public/events/${EVENT}/forms/${form.formId}/applications`, { method: "POST", headers: h, body: JSON.stringify({ pin: "730914", answers }) });
      }
    }
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
        pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        // horizontal scrollers inside the body (wide tables and boards cut by the column)
        scrollers: [...main.querySelectorAll("*")].filter((n) => {
          const st = getComputedStyle(n);
          return /(auto|scroll)/.test(st.overflowX) && n.scrollWidth > n.clientWidth + 1;
        }).map((n) => `${(n.className || n.tagName).toString().split(" ")[0]} ${n.clientWidth}/${n.scrollWidth}`).join(", "),
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
for (const r of rows) console.log([r.size, r.name, r.framed, r.title, r.content, r.content - r.title, r.children, r.pageOverflow ? "PAGE-OVERFLOW" : "", r.scrollers ?? r.error ?? ""].join("\t"));
