const { chromium, devices } = require("playwright");
const OUT = "/home/user/SCENE/docs/test_results/456-arrival-roster";
const EVENT = "00000000-0000-4000-8000-000000000020";
const API = `http://localhost:5173/api/v1/operator/events/${EVENT}`;
const people = JSON.parse(require("fs").readFileSync(process.argv[2], "utf8"));
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await context.newPage();
  const log = [];
  await context.addCookies([{ name: "XSRF-TOKEN", value: "t", url: "http://localhost:5173" }]);
  const r = await page.request.post("http://localhost:5173/api/v1/operator/auth/login", {
    headers: { "X-XSRF-TOKEN": "t", "Content-Type": "application/json" }, data: { userId: "00000000-0000-4000-8000-000000000001" } });
  log.push(`login ${r.status()}`);

  // 1. 식수 현황의 다음 끼니 "아직 안 옴"
  await page.goto(`http://localhost:5173/events/${EVENT}/meals`);
  const next = page.getByRole("region", { name: /다음 끼니/ });
  await next.waitFor();
  log.push(`meals next: ${(await next.innerText()).replace(/\n/g, " / ")}`);
  await page.screenshot({ path: `${OUT}/1-meals-next.png` });

  // 2. 현장 운영: 현황 아래 도착 예정 줄과 명단의 도착 예정 칸
  await page.goto(`http://localhost:5173/events/${EVENT}/field`);
  const arrivals = page.getByRole("region", { name: "미완료 도착 예정" });
  await arrivals.waitFor();
  log.push(`field arrivals: ${(await arrivals.innerText()).replace(/\n/g, " / ")}`);
  await page.getByRole("list", { name: "체크인 명단" }).waitFor();
  await page.screenshot({ path: `${OUT}/2-field-summary.png` });
  for (const row of await page.getByRole("list", { name: "체크인 명단" }).getByRole("listitem").all()) {
    log.push(`  row: ${(await row.innerText()).replace(/\n/g, " | ")}`);
  }
  await page.screenshot({ path: `${OUT}/3-field-roster-full.png`, fullPage: true });

  // 3. 미완료 → 왔어야 함 (칩)
  await page.getByRole("button", { name: "미완료", exact: true }).click();
  await page.waitForTimeout(800);
  log.push(`미완료 list: ${await page.locator(".event-field__list .event-field__name").allInnerTexts()}`);
  await page.getByRole("button", { name: "왔어야 함", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll(".event-field__list .event-field__name").length === 3, null, { timeout: 5000 });
  log.push(`왔어야 함 list: ${await page.locator(".event-field__list .event-field__name").allInnerTexts()}`);
  await page.getByRole("list", { name: "체크인 명단" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/4-overdue-filter.png` });

  // 4. 다른 접수대가 전체4를 체크인 → 10초 안에 왔어야 함 명단에서 빠진다
  const ci = await page.request.post(`${API}/check-ins`, {
    headers: { "X-XSRF-TOKEN": "t", "Content-Type": "application/json", "Idempotency-Key": "e4-" + Date.now() },
    data: { mode: "MANUAL", participantId: people["전체4"] } });
  log.push(`check-in 전체4 by another desk ${ci.status()}`);
  const t0 = Date.now();
  await page.waitForFunction(() => document.querySelectorAll(".event-field__list .event-field__name").length === 2, null, { timeout: 15000 });
  log.push(`auto refresh after ${Date.now() - t0}ms: 왔어야 함 list ${await page.locator(".event-field__list .event-field__name").allInnerTexts()}`);
  log.push(`field arrivals now: ${(await arrivals.innerText()).replace(/\n/g, " / ")}`);
  await page.screenshot({ path: `${OUT}/5-after-checkin.png` });

  // 5. 식수 현황도 같은 수
  await page.goto(`http://localhost:5173/events/${EVENT}/meals`);
  await next.waitFor();
  log.push(`meals next now: ${(await next.innerText()).replace(/\n/g, " / ")}`);

  // 6. 예정 모름 칩
  await page.goto(`http://localhost:5173/events/${EVENT}/field`);
  await page.getByRole("button", { name: "예정 모름", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll(".event-field__list .event-field__name").length === 1, null, { timeout: 5000 });
  log.push(`예정 모름 list: ${await page.locator(".event-field__list .event-field__name").allInnerTexts()}`);
  await page.getByRole("list", { name: "체크인 명단" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/6-unknown-filter.png` });

  require("fs").writeFileSync(`${OUT}/click-log.txt`, log.join("\n") + "\n");
  console.log(log.join("\n"));
  await browser.close();
})();
