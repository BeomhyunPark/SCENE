// G5 (#460) 실제 클릭: 로컬 서버 + Vite(실제 API). node room-click.cjs people.json
const { chromium, devices } = require("playwright");
const fs = require("fs");
const OUT = __dirname;
const EVENT = "00000000-0000-4000-8000-000000000020";
const OWNER = "00000000-0000-4000-8000-000000000001";
const WEB = "http://localhost:5173";
const seed = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const log = [];
const step = (text) => { log.push(text); console.log(text); };

async function login(context, page) {
  await context.addCookies([{ name: "XSRF-TOKEN", value: "t", url: WEB }]);
  const r = await page.request.post(`${WEB}/api/v1/operator/auth/login`, {
    headers: { "X-XSRF-TOKEN": "t", "Content-Type": "application/json" }, data: { userId: OWNER } });
  step(`login ${r.status()}`);
}

(async () => {
  const browser = await chromium.launch();

  // 1~2. 참가 현황 표 (노트북 화면)
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const tablePage = await desk.newPage();
  await login(desk, tablePage);
  await tablePage.goto(`${WEB}/events/${EVENT}/participants`);
  const grid = tablePage.getByRole("grid", { name: "신청자 명단" });
  await grid.waitFor();
  const headers = await grid.getByRole("columnheader").allInnerTexts();
  step(`table headers: ${headers.map((h) => h.split("\n")[0]).join(" | ")}`);
  const rows = await grid.getByRole("row").allInnerTexts();
  for (const row of rows.slice(1)) step(`table row: ${row.replace(/\s*\n\s*/g, " / ")}`);
  await tablePage.screenshot({ path: `${OUT}/1-table-room-column.png` });

  await tablePage.getByRole("button", { name: "필터" }).click();
  await tablePage.getByRole("combobox", { name: "조건 더하기" }).selectOption("room");
  const roomGroup = tablePage.getByRole("group", { name: /방/ });
  step(`room filter options: ${(await roomGroup.getByRole("checkbox").evaluateAll((els) => els.map((el) => el.closest("label")?.innerText.replace(/\s+/g, " ").trim())) ).join(" | ")}`);
  await roomGroup.getByRole("checkbox", { name: /^숙박 안 함/ }).click();
  await tablePage.waitForTimeout(300);
  step(`filter 숙박 안 함: ${await tablePage.locator(".roster__summary strong").first().innerText()}`);
  await tablePage.screenshot({ path: `${OUT}/2-table-not-lodging-filter.png` });

  // 3~5. 현장 운영 (휴대폰)
  const phone = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await phone.newPage();
  await login(phone, page);
  await page.goto(`${WEB}/events/${EVENT}/field`);
  const list = page.getByRole("list", { name: "체크인 명단" });
  await list.waitFor();
  await page.waitForTimeout(500);
  for (const item of await list.getByRole("listitem").all()) {
    step(`roster: ${(await item.innerText()).replace(/\s*\n\s*/g, " / ")}`);
  }
  await page.screenshot({ path: `${OUT}/3-field-roster-rooms.png`, fullPage: true });

  await page.getByRole("button", { name: "94 김하늘 체크인" }).click();
  const status = page.getByRole("status").filter({ hasText: "체크인했어요" });
  await status.waitFor();
  step(`manual check-in notice: ${await status.innerText()}`);
  await page.screenshot({ path: `${OUT}/4-field-checkin-notice.png` });

  await page.getByRole("button", { name: "98 정집회 체크인" }).click();
  const away = page.getByRole("status").filter({ hasText: "정집회" });
  await away.waitFor();
  step(`not-lodging check-in notice: ${await away.innerText()}`);

  // 6. 작업본 변경(최예린 302→301, 한늦게 → 302)을 공개하면 명단이 스스로 다시 읽어 바뀐다.
  const board = await page.request.get(`${WEB}/api/v1/operator/events/${EVENT}/room-board`);
  const version = (await board.json()).boardVersion;
  const pub = await page.request.post(`${WEB}/api/v1/operator/events/${EVENT}/rooms/publish`, {
    headers: { "X-XSRF-TOKEN": "t", "Content-Type": "application/json" },
    data: { expectedBoardVersion: version, confirmUnassigned: true, confirmNotLodging: true, notify: false } });
  step(`republish ${pub.status()} ${(await pub.json()).result}`);
  await page.waitForTimeout(11500);
  for (const name of ["97 최예린", "99 한늦게"]) {
    const row = list.getByRole("listitem").filter({ has: page.getByText(name, { exact: true }) });
    step(`after republish ${name}: ${(await row.innerText()).replace(/\s*\n\s*/g, " / ")}`);
  }
  await page.screenshot({ path: `${OUT}/5-field-after-republish.png`, fullPage: true });

  fs.writeFileSync(`${OUT}/click-log.txt`, log.join("\n") + "\n");
  await browser.close();
})().catch((error) => { console.error(error); fs.writeFileSync(`${OUT}/click-log.txt`, log.join("\n") + `\nERROR ${error}\n`); process.exit(1); });
