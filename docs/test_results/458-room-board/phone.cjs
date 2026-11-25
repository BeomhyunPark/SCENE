// Phone-size pass (iPhone 13) over the event the desktop run filled. Usage: SEED=seed200.json node phone.cjs <outDir>
const { chromium, devices } = require("playwright");
const fs = require("fs");
const seed = JSON.parse(fs.readFileSync(process.env.SEED || __dirname + "/seed200.json", "utf8"));
const OUT = process.argv[2];
const BASE = "http://localhost:5173";
const E = seed.eventId;
const log = [];
const t0 = Date.now();
const mark = (step, extra = "") => {
  const line = `${((Date.now() - t0) / 1000).toFixed(1)}s ${step}${extra ? " — " + extra : ""}`;
  log.push(line);
  console.log(line);
};
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices["iPhone 13"], locale: "ko-KR" });
  const page = await context.newPage();
  await page.goto(BASE + "/login");
  await context.addCookies([{ name: "XSRF-TOKEN", value: "dev-csrf", url: BASE }]);
  await page.request.post(BASE + "/api/v1/operator/auth/login", {
    headers: { "X-XSRF-TOKEN": "dev-csrf", "Content-Type": "application/json" },
    data: { userId: "00000000-0000-4000-8000-000000000001" },
  });
  await page.goto(`${BASE}/events/${E}/rooms`);
  await page.getByText(/^배정 \d/).waitFor();
  mark("휴대폰 숙소 화면", await page.locator(".event-groups__chip").textContent());
  await page.screenshot({ path: `${OUT}/11-phone-top.png` });
  const width = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  mark("가로 넘침", `scrollWidth ${width[0]} / innerWidth ${width[1]}`);
  await page.getByRole("article", { name: "301호" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/12-phone-room-card.png` });
  // Pick someone in 301호 and move them with the bottom bar.
  const row = page.getByRole("article", { name: "301호" }).locator(".event-rooms__member").first();
  const name = (await row.locator(".event-groups__name").textContent()).trim();
  await row.locator("input[type=checkbox]").check();
  await page.getByLabel("보낼 방").evaluate((select) => {
    const option = [...select.options].find((item) => /^501호/.test(item.textContent));
    select.value = option.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.screenshot({ path: `${OUT}/13-phone-pick-bar.png` });
  await page.getByRole("region", { name: "고른 사람 옮기기" }).getByRole("button", { name: "보내기" }).click();
  const notice = page.locator(".event-groups__notice-slot .event-groups__notice").first();
  await notice.waitFor();
  mark(`고른 사람 보내기 ${name}→501호`, (await notice.textContent()).trim());
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => !document.querySelector(".event-groups__fetching"));
  await page.getByRole("button", { name: "참가자에게 공개" }).click();
  await page.getByRole("dialog").waitFor();
  await page.screenshot({ path: `${OUT}/14-phone-publish-dialog.png` });
  mark("공개 확인 창", (await page.locator("#confirm-dialog-title").textContent()).trim());
  await page.getByRole("dialog").getByRole("button", { name: "취소" }).click();
  // Drag on a phone starts on the grip only (touch).
  await page.getByRole("article", { name: "302호" }).scrollIntoViewIfNeeded();
  const grip = page.getByRole("article", { name: "302호" }).locator(".event-groups__grip").first();
  mark("터치 끌기 손잡이", (await grip.getAttribute("aria-label")) ?? "");
  fs.writeFileSync(`${OUT}/phone-run.log`, log.join("\n") + "\n");
  await browser.close();
})().catch((error) => {
  console.error(error);
  fs.writeFileSync(`${OUT}/phone-run.log`, log.join("\n") + "\nFAILED: " + error.message + "\n");
  process.exit(1);
});
