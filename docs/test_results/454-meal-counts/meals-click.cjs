const { chromium, devices } = require("playwright");
const OUT = "/home/user/SCENE/docs/test_results/454-meal-counts";
const EVENT = "00000000-0000-4000-8000-000000000020";
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices["iPhone 13"], permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  const log = [];
  await context.addCookies([{ name: "XSRF-TOKEN", value: "t", url: "http://localhost:5173" }]);
  const r = await page.request.post("http://localhost:5173/api/v1/operator/auth/login", {
    headers: { "X-XSRF-TOKEN": "t", "Content-Type": "application/json" }, data: { userId: "00000000-0000-4000-8000-000000000001" } });
  log.push(`login ${r.status()}`);
  await page.goto(`http://localhost:5173/events/${EVENT}/field`);
  const link = page.getByRole("link", { name: "식수 현황 보기" });
  await link.waitFor();
  await page.screenshot({ path: `${OUT}/1-field-link.png` });
  await link.click();
  await page.getByRole("region", { name: /다음 끼니/ }).waitFor();
  log.push(`url ${page.url()}`);
  log.push(`next: ${await page.getByRole("region", { name: /다음 끼니/ }).innerText()}`);
  await page.screenshot({ path: `${OUT}/2-meals-next.png` });
  await page.screenshot({ path: `${OUT}/3-meals-full.png`, fullPage: true });
  await page.getByRole("button", { name: "다음 끼니 복사" }).click();
  await page.getByText("다음 끼니를 복사했어요").waitFor();
  log.push(`clipboard(next):\n${await page.evaluate(() => navigator.clipboard.readText())}`);
  await page.getByRole("button", { name: "남은 끼니 복사" }).click();
  await page.waitForTimeout(300);
  log.push(`clipboard(rest):\n${await page.evaluate(() => navigator.clipboard.readText())}`);
  await page.screenshot({ path: `${OUT}/4-copied.png` });
  // Another desk checks someone in; the screen reads it within 10 seconds.
  const before = await page.locator(".meals__next-count strong").innerText();
  const roster = await page.request.get(`http://localhost:5173/api/v1/operator/events/${EVENT}/check-in-roster?checkedIn=false&size=50`);
  const pending = (await roster.json()).items.find((item) => item.name === "부분2");
  const ci = await page.request.post(`http://localhost:5173/api/v1/operator/events/${EVENT}/check-ins`, {
    headers: { "X-XSRF-TOKEN": "t", "Content-Type": "application/json", "Idempotency-Key": "e2e-" + Date.now() },
    data: { mode: "MANUAL", participantId: pending.participantId } });
  log.push(`check-in 부분2 ${ci.status()}`);
  const late = (await roster.json()).items.find((item) => item.name === "전체6");
  await page.request.post(`http://localhost:5173/api/v1/operator/events/${EVENT}/check-ins`, {
    headers: { "X-XSRF-TOKEN": "t", "Content-Type": "application/json", "Idempotency-Key": "e2e-late-" + Date.now() },
    data: { mode: "MANUAL", participantId: late.participantId } });
  const t0 = Date.now();
  await page.waitForFunction((b) => document.querySelector(".meals__next-count strong")?.textContent !== b, before, { timeout: 15000 });
  log.push(`auto refresh after ${Date.now() - t0}ms: ${before} -> ${await page.locator(".meals__next-count strong").innerText()}`);
  log.push(`next now: ${await page.getByRole("region", { name: /다음 끼니/ }).innerText()}`);
  await page.screenshot({ path: `${OUT}/5-after-checkin.png` });
  await page.getByText("숫자는 이렇게 나와요").click();
  await page.getByText("숫자는 이렇게 나와요").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/6-how.png` });
  require("fs").writeFileSync(`${OUT}/click-log.txt`, log.join("\n") + "\n");
  console.log(log.join("\n"));
  await browser.close();
})();
